const { query, transaction } = require('../config/database');

class BaseModel {
    constructor(tableName) {
        this.tableName = tableName;
    }

    // 查询所有记录
    async findAll(conditions = {}, orderBy = 'id') {
        try {
            let sql = `SELECT * FROM ${this.tableName}`;
            const params = [];

            // 添加条件（安全处理空值）
            if (conditions && typeof conditions === 'object' && Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                sql += ` WHERE ${whereClause}`;
                params.push(...Object.values(conditions));
            }

            // 添加排序
            sql += ` ORDER BY ${orderBy}`;

            const results = await query(sql, params);
            return results;
        } catch (error) {
            console.error(`查询 ${this.tableName} 失败:`, error);
            throw error;
        }
    }

    // 根据ID查询
    async findById(id, idField = 'id') {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE ${idField} = ? LIMIT 1`;
            const results = await query(sql, [id]);
            return results[0] || null;
        } catch (error) {
            console.error(`查询 ${this.tableName} ID ${id} 失败:`, error);
            throw error;
        }
    }

    // 创建记录
    async create(data) {
        try {
            const keys = Object.keys(data);
            const values = Object.values(data);
            const placeholders = keys.map(() => '?').join(',');

            const sql = `INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})`;
            console.log(`🔍 执行SQL: ${sql}`);
            console.log(`🔍 参数:`, values);

            const result = await query(sql, values);
            console.log(`🔍 SQL执行结果:`, result);

            return {
                success: true,
                insertId: result.insertId,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            console.error(`创建 ${this.tableName} 记录失败:`, error);
            throw error;
        }
    }

    // 更新记录
    async update(id, data, idField = 'id') {
        try {
            const keys = Object.keys(data);
            const values = Object.values(data);
            const setClause = keys.map(key => `${key} = ?`).join(',');

            const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${idField} = ?`;
            const result = await query(sql, [...values, id]);
            
            return {
                success: true,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            console.error(`更新 ${this.tableName} ID ${id} 失败:`, error);
            throw error;
        }
    }

    // 删除记录
    async delete(id, idField = 'id') {
        try {
            const sql = `DELETE FROM ${this.tableName} WHERE ${idField} = ?`;
            const result = await query(sql, [id]);
            
            return {
                success: true,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            console.error(`删除 ${this.tableName} ID ${id} 失败:`, error);
            throw error;
        }
    }

    // 统计记录数
    async count(conditions = {}) {
        try {
            let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
            const params = [];

            if (Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                sql += ` WHERE ${whereClause}`;
                params.push(...Object.values(conditions));
            }

            const results = await query(sql, params);
            return results[0].count;
        } catch (error) {
            console.error(`统计 ${this.tableName} 失败:`, error);
            throw error;
        }
    }

    // 检查记录是否存在
    async exists(id, idField = 'id') {
        try {
            const count = await this.count({ [idField]: id });
            return count > 0;
        } catch (error) {
            console.error(`检查 ${this.tableName} ID ${id} 是否存在失败:`, error);
            throw error;
        }
    }
}

module.exports = BaseModel;
