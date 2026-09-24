/**
 * 零依赖 ZIP 读写实现
 *
 * 为什么不用第三方库：
 *   实施计划 §23 要求对 ZIP 做路径穿越、压缩炸弹、非法编码等安全预检。
 *   自己解析中央目录才能在"解压之前"就拿到全部条目元数据，并把同一套校验
 *   同时用在预检和真正解压两个环节（纵深防御）。同时也避免了在生产服务器
 *   上再装一堆依赖（§75 不要因为源慢就改方案）。
 *
 * 支持：store(0) / deflate(8)、ZIP64 尺寸、UTF-8 文件名标志位、
 *       非 UTF-8 文件名按 GBK 回退解码（国内打包工具的常见情况）。
 */

import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOC_SIG = 0x07064b50;

const MAX_ENTRIES = 200000;

/** CRC32 */
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c;
    }
    return table;
})();

export function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

/** 文件名解码：优先 UTF-8 标志位，否则依次尝试 UTF-8 / GBK */
function decodeName(bytes, utf8Flag) {
    if (utf8Flag) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        try {
            return new TextDecoder('gbk', { fatal: true }).decode(bytes);
        } catch {
            throw new ZipError('文件名不是合法 UTF-8/GBK 编码');
        }
    }
}

class ZipError extends Error {}

/**
 * 读取 ZIP 中央目录
 * @returns {{entries: Array, comment: string, truncated: boolean}}
 */
export function readCentralDirectory(buf) {
    if (buf.length < 22) throw new ZipError('文件太小，不是有效的 ZIP');
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new ZipError('缺少 ZIP 签名（PK），不是 ZIP 文件');

    const searchFrom = Math.max(0, buf.length - 65557);
    let eocd = -1;
    for (let i = buf.length - 22; i >= searchFrom; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { eocd = i; break; }
    }
    if (eocd < 0) throw new ZipError('找不到 ZIP 结束记录（EOCD），文件可能被截断');

    let entryCount = buf.readUInt16LE(eocd + 10);
    let cdSize = buf.readUInt32LE(eocd + 12);
    let cdOffset = buf.readUInt32LE(eocd + 16);
    const commentLen = buf.readUInt16LE(eocd + 20);
    const comment = buf.toString('utf8', eocd + 22, Math.min(eocd + 22 + commentLen, buf.length));
    if (buf.readUInt16LE(eocd + 4) || buf.readUInt16LE(eocd + 6)) throw new ZipError('不支持分卷 ZIP');

    // ZIP64：当标准字段溢出时，从 ZIP64 EOCD 取真实值
    if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
        const locOff = eocd - 20;
        if (locOff >= 0 && buf.readUInt32LE(locOff) === ZIP64_LOC_SIG) {
            const z64 = Number(buf.readBigUInt64LE(locOff + 8));
            if (z64 >= 0 && z64 + 56 <= buf.length && buf.readUInt32LE(z64) === ZIP64_EOCD_SIG) {
                entryCount = Number(buf.readBigUInt64LE(z64 + 32));
                cdSize = Number(buf.readBigUInt64LE(z64 + 40));
                cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
            }
        }
    }

    if (entryCount > MAX_ENTRIES) throw new ZipError(`条目数 ${entryCount} 异常，已超过上限 ${MAX_ENTRIES}`);
    if (!Number.isSafeInteger(cdOffset + cdSize) || cdOffset + cdSize > eocd) throw new ZipError('中央目录越界，文件不完整或已损坏');

    const entries = [];
    let p = cdOffset;
    for (let i = 0; i < entryCount; i++) {
        if (p + 46 > cdOffset + cdSize || buf.readUInt32LE(p) !== CD_SIG) {
            throw new ZipError(`中央目录第 ${i + 1} 条记录损坏`);
        }
        const flags = buf.readUInt16LE(p + 8);
        const method = buf.readUInt16LE(p + 10);
        const crc = buf.readUInt32LE(p + 16);
        let compSize = buf.readUInt32LE(p + 20);
        let uncompSize = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const cmtLen = buf.readUInt16LE(p + 32);
        if (p + 46 + nameLen + extraLen + cmtLen > cdOffset + cdSize) throw new ZipError('中央目录条目越界');
        const externalAttrs = buf.readUInt32LE(p + 38);
        let localOffset = buf.readUInt32LE(p + 42);

        const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
        const name = decodeName(nameBytes, (flags & 0x800) !== 0);

        // ZIP64 扩展字段
        if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
            let q = p + 46 + nameLen;
            const extraEnd = q + extraLen;
            while (q + 4 <= extraEnd) {
                const hid = buf.readUInt16LE(q);
                const hlen = buf.readUInt16LE(q + 2);
                if (q + 4 + hlen > extraEnd) throw new ZipError('ZIP64 扩展字段越界');
                if (hid === 0x0001) {
                    const needed = [uncompSize, compSize, localOffset].filter((n) => n === 0xffffffff).length * 8;
                    if (hlen < needed) throw new ZipError('ZIP64 扩展字段不完整');
                    let r = q + 4;
                    if (uncompSize === 0xffffffff && r + 8 <= extraEnd) { uncompSize = Number(buf.readBigUInt64LE(r)); r += 8; }
                    if (compSize === 0xffffffff && r + 8 <= extraEnd) { compSize = Number(buf.readBigUInt64LE(r)); r += 8; }
                    if (localOffset === 0xffffffff && r + 8 <= extraEnd) { localOffset = Number(buf.readBigUInt64LE(r)); }
                    break;
                }
                q += 4 + hlen;
            }
        }

        const unixMode = externalAttrs >>> 16;
        if (![compSize, uncompSize, localOffset].every((n) => Number.isSafeInteger(n) && n >= 0 && n !== 0xffffffff)) throw new ZipError('ZIP64 尺寸或偏移无效');
        entries.push({
            name,
            nameBytes,
            flags,
            method,
            crc,
            compSize,
            uncompSize,
            localOffset,
            externalAttrs,
            isDirectory: name.endsWith('/') || (unixMode & 0o170000) === 0o040000,
            isSymlink: (unixMode & 0o170000) === 0o120000,
            encrypted: (flags & 0x1) !== 0,
            utf8: (flags & 0x800) !== 0,
            dosTime: buf.readUInt16LE(p + 12),
            dosDate: buf.readUInt16LE(p + 14),
        });
        p += 46 + nameLen + extraLen + cmtLen;
    }

    return { entries, comment, truncated: false };
}

/** 解压单个条目，返回 Buffer。会再次校验名称安全性。 */
export function extractEntry(buf, entry, { maxBytes = 512 * 1024 * 1024 } = {}) {
    const p = entry.localOffset;
    if (!Number.isSafeInteger(p) || p < 0 || p + 30 > buf.length || buf.readUInt32LE(p) !== LFH_SIG) {
        throw new ZipError(`条目 ${entry.name} 的本地头损坏`);
    }
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const dataStart = p + 30 + nameLen + extraLen;
    const dataEnd = dataStart + entry.compSize;
    if (dataEnd > buf.length) throw new ZipError(`条目 ${entry.name} 数据越界`);
    if (!buf.subarray(p + 30, p + 30 + nameLen).equals(entry.nameBytes)
        || buf.readUInt16LE(p + 8) !== entry.method || buf.readUInt16LE(p + 6) !== entry.flags) {
        throw new ZipError(`条目 ${entry.name} 本地头与中央目录不一致`);
    }

    if (entry.encrypted) throw new ZipError(`条目 ${entry.name} 已加密，无法处理`);
    if (entry.uncompSize > maxBytes) throw new ZipError(`条目 ${entry.name} 解压后 ${entry.uncompSize} 字节，超过上限`);

    const raw = buf.subarray(dataStart, dataEnd);
    let out;
    if (entry.method === 0) {
        if (raw.length > maxBytes) throw new ZipError(`条目 ${entry.name} 超过解压上限`);
        out = Buffer.from(raw);
    }
    else if (entry.method === 8) {
        out = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, Math.min(maxBytes, entry.uncompSize)) });
    } else {
        throw new ZipError(`条目 ${entry.name} 使用了不支持的压缩算法 ${entry.method}`);
    }
    if (out.length !== entry.uncompSize) throw new ZipError(`条目 ${entry.name} 实际大小与声明不一致`);
    if (crc32(out) !== entry.crc) {
        throw new ZipError(`条目 ${entry.name} CRC 校验失败，文件已损坏`);
    }
    return out;
}

/** 打包为 ZIP。默认 store（题目数据本身已压过，再压一次收益低且更慢） */
export function writeZip(files, { deflate = false } = {}) {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const [name, content] of files) {
        const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
        const data = deflate ? zlib.deflateRawSync(raw, { level: 9 }) : raw;
        const method = deflate ? 8 : 0;
        const nameBytes = Buffer.from(name, 'utf8');
        const crc = crc32(raw);

        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(LFH_SIG, 0);
        lfh.writeUInt16LE(20, 4);           // version needed
        lfh.writeUInt16LE(0x800, 6);        // UTF-8 flag
        lfh.writeUInt16LE(method, 8);
        lfh.writeUInt16LE(0, 10);           // time
        lfh.writeUInt16LE(0x21, 12);        // date (1980-01-01)
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(data.length, 18);
        lfh.writeUInt32LE(raw.length, 22);
        lfh.writeUInt16LE(nameBytes.length, 26);
        lfh.writeUInt16LE(0, 28);
        chunks.push(lfh, nameBytes, data);

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(CD_SIG, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(0x800, 8);
        cd.writeUInt16LE(method, 10);
        cd.writeUInt16LE(0, 12);
        cd.writeUInt16LE(0x21, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(data.length, 20);
        cd.writeUInt32LE(raw.length, 24);
        cd.writeUInt16LE(nameBytes.length, 28);
        cd.writeUInt16LE(0, 30);
        cd.writeUInt16LE(0, 32);
        cd.writeUInt16LE(0, 34);
        cd.writeUInt16LE(0, 36);
        cd.writeUInt32LE(0, 38);
        cd.writeUInt32LE(offset, 42);
        central.push(cd, nameBytes);

        offset += lfh.length + nameBytes.length + data.length;
    }

    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIG, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...chunks, cdBuf, eocd]);
}

export { ZipError };
