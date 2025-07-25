const mysql = require('mysql2/promise');
require('dotenv').config();

// 数据库配置
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'uYe_9iC@BhXCauN*9npft7dU',
    database: process.env.DB_NAME || 'digimon_legend',
    charset: 'utf8mb4',
    timezone: '+08:00',
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

// 创建数据库连接池
const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 测试数据库连接
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ 数据库连接成功');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ 数据库连接失败:', error.message);
        return false;
    }
}

// 执行SQL查询
async function query(sql, params = []) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('SQL执行错误:', error.message);
        console.error('SQL语句:', sql);
        throw error;
    }
}

// 批量插入数据
async function batchInsert(tableName, data, batchSize = 100) {
    if (!data || data.length === 0) {
        console.log(`⚠️  ${tableName} 表没有数据需要插入`);
        return;
    }

    const keys = Object.keys(data[0]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`;

    let insertedCount = 0;
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        for (const item of batch) {
            try {
                const values = keys.map(key => {
                    const value = item[key];
                    // 如果是对象或数组，转换为JSON字符串
                    if (typeof value === 'object' && value !== null) {
                        return JSON.stringify(value);
                    }
                    return value;
                });
                
                await query(sql, values);
                insertedCount++;
            } catch (error) {
                console.error(`插入 ${tableName} 数据失败:`, error.message);
                console.error('数据:', item);
            }
        }
    }
    
    console.log(`✅ ${tableName} 表插入了 ${insertedCount} 条数据`);
}

// 清空表数据
async function truncateTable(tableName) {
    try {
        await query(`TRUNCATE TABLE ${tableName}`);
        console.log(`🗑️  已清空 ${tableName} 表`);
    } catch (error) {
        console.error(`清空 ${tableName} 表失败:`, error.message);
    }
}

// 关闭数据库连接
async function closeConnection() {
    try {
        await pool.end();
        console.log('📴 数据库连接已关闭');
    } catch (error) {
        console.error('关闭数据库连接失败:', error.message);
    }
}

module.exports = {
    pool,
    query,
    batchInsert,
    truncateTable,
    testConnection,
    closeConnection
};
