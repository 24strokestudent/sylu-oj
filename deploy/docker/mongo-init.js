// SYLU OJ · MongoDB 首次初始化脚本
//
// 与 Hydro 官方 setup.sh 的做法一致：创建专用数据库用户 hydro，
// 只授予 hydro 库的 readWrite 权限，避免应用直接使用 root 账号。
// 该脚本只在数据目录为空（首次启动）时由 mongo 镜像执行。

const dbName = 'hydro';
const password = process.env.MONGO_HYDRO_PASSWORD;

if (!password) {
    throw new Error('MONGO_HYDRO_PASSWORD 未设置，拒绝创建空口令用户');
}

const target = db.getSiblingDB(dbName);
target.createUser({
    user: 'hydro',
    pwd: password,
    roles: [{ role: 'readWrite', db: dbName }],
});

print(`[sylu] 已在 ${dbName} 库创建用户 hydro`);
