import mysql2, { createConnection } from 'mysql2/promise';

export const db  = await mysql2.createPool({
    database: 'railway',
    host: 'caboose.proxy.rlwy.net',
    user: 'root',
    password: 'EqjYxUIuSJHsGogjJPdADjNjHICvvAcD',
    port: 25602
});

