const BaseModel = require('./BaseModel');

class ChangelogModel extends BaseModel {
    constructor() {
        super('changelogs');
    }

    // 获取所有格式化的更新日志
    async getAllFormatted() {
        try {
            const changelogs = await this.findAll(null, 'date DESC');
            return changelogs.map(this.formatChangelog);
        } catch (error) {
            console.error('获取格式化更新日志失败:', error);
            throw error;
        }
    }

    // 格式化更新日志数据（数据库 -> API格式）
    formatChangelog(dbChangelog) {
        // 安全的JSON解析函数
        const safeJsonParse = (jsonString, defaultValue = []) => {
            if (!jsonString) return defaultValue;
            
            // 如果已经是对象，直接返回
            if (typeof jsonString === 'object') return jsonString;
            
            // 如果是字符串，尝试解析
            if (typeof jsonString === 'string') {
                try {
                    return JSON.parse(jsonString);
                } catch (error) {
                    console.warn('JSON解析失败，使用默认值:', error.message, jsonString);
                    return defaultValue;
                }
            }
            
            return defaultValue;
        };

        // 格式化日期为YYYY-MM-DD格式
        const formatDate = (dateValue) => {
            if (!dateValue) return '';
            const date = new Date(dateValue);
            return date.toISOString().split('T')[0]; // 只取日期部分
        };

        return {
            version: dbChangelog.version,
            date: formatDate(dbChangelog.date),
            changes: safeJsonParse(dbChangelog.changes, []),
            description: dbChangelog.description || ''
        };
    }

    // 创建更新日志
    async createChangelog(data) {
        try {
            const changelogData = {
                version: data.version,
                date: data.date,
                changes: JSON.stringify(data.changes || []),
                description: data.description || ''
            };

            return await this.create(changelogData);
        } catch (error) {
            console.error('创建更新日志失败:', error);
            throw error;
        }
    }

    // 更新更新日志
    async updateChangelog(version, data) {
        try {
            const updateData = {};

            if (data.version !== undefined) {
                updateData.version = data.version;
            }
            if (data.date !== undefined) {
                updateData.date = data.date;
            }
            if (data.changes !== undefined) {
                updateData.changes = JSON.stringify(data.changes);
            }
            if (data.description !== undefined) {
                updateData.description = data.description;
            }

            return await this.update(version, updateData, 'version');
        } catch (error) {
            console.error('更新更新日志失败:', error);
            throw error;
        }
    }

    // 删除更新日志
    async deleteChangelog(version) {
        try {
            return await this.delete(version, 'version');
        } catch (error) {
            console.error('删除更新日志失败:', error);
            throw error;
        }
    }

    // 按版本查询
    async getByVersion(version) {
        try {
            const changelog = await this.findOne({ version });
            return changelog ? this.formatChangelog(changelog) : null;
        } catch (error) {
            console.error(`按版本查询更新日志失败 (${version}):`, error);
            throw error;
        }
    }

    // 按日期范围查询
    async getByDateRange(startDate, endDate) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE date BETWEEN ? AND ? ORDER BY date DESC`;
            const changelogs = await this.query(sql, [startDate, endDate]);
            return changelogs.map(this.formatChangelog);
        } catch (error) {
            console.error(`按日期范围查询更新日志失败 (${startDate} - ${endDate}):`, error);
            throw error;
        }
    }

    // 获取最新的更新日志
    async getLatest(limit = 5) {
        try {
            const sql = `SELECT * FROM ${this.tableName} ORDER BY date DESC LIMIT ?`;
            const changelogs = await this.query(sql, [limit]);
            return changelogs.map(this.formatChangelog);
        } catch (error) {
            console.error(`获取最新更新日志失败 (limit: ${limit}):`, error);
            throw error;
        }
    }
}

module.exports = new ChangelogModel();
