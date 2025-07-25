const BaseModel = require('./BaseModel');

class DigimonModel extends BaseModel {
    constructor() {
        super('digimons');
    }

    // 获取所有数码兽（格式化输出）
    async getAllFormatted() {
        try {
            const digimons = await this.findAll({}, 'name');
            return digimons.map(this.formatDigimon);
        } catch (error) {
            console.error('获取格式化数码兽数据失败:', error);
            throw error;
        }
    }

    // 根据ID获取数码兽（格式化输出）
    async getByIdFormatted(id) {
        try {
            const digimon = await this.findById(id);
            return digimon ? this.formatDigimon(digimon) : null;
        } catch (error) {
            console.error(`获取数码兽 ${id} 失败:`, error);
            throw error;
        }
    }

    // 创建数码兽
    async createDigimon(data) {
        try {
            const digimonData = {
                id: data.id,
                name: data.name,
                image: data.image || null,
                positioning: data.positioning || null,
                type: data.Type || data.type || null,  // 兼容大小写
                armor: data.armor || null,
                fit: data.fit || null,
                egg: data.egg || null,
                time: data.time || null,
                skills: JSON.stringify(data.skills || [])
            };

            return await this.create(digimonData);
        } catch (error) {
            console.error('创建数码兽失败:', error);
            throw error;
        }
    }

    // 更新数码兽
    async updateDigimon(id, data) {
        try {
            const updateData = {};
            
            if (data.name !== undefined) updateData.name = data.name;
            if (data.image !== undefined) updateData.image = data.image;
            if (data.positioning !== undefined) updateData.positioning = data.positioning;
            if (data.Type !== undefined || data.type !== undefined) {
                updateData.type = data.Type || data.type;
            }
            if (data.armor !== undefined) updateData.armor = data.armor;
            if (data.fit !== undefined) updateData.fit = data.fit;
            if (data.egg !== undefined) updateData.egg = data.egg;
            if (data.time !== undefined) updateData.time = data.time;
            if (data.skills !== undefined) {
                updateData.skills = JSON.stringify(data.skills);
            }

            return await this.update(id, updateData);
        } catch (error) {
            console.error(`更新数码兽 ${id} 失败:`, error);
            throw error;
        }
    }

    // 格式化数码兽数据（数据库 -> API格式）
    formatDigimon(dbDigimon) {
        // 安全的JSON解析函数
        const safeJsonParse = (jsonString, defaultValue = []) => {
            if (!jsonString) return defaultValue;

            // 如果已经是对象，直接返回
            if (typeof jsonString === 'object') return jsonString;

            // 如果是字符串，尝试解析
            if (typeof jsonString === 'string') {
                // 检查是否是无效的对象字符串
                if (jsonString.includes('[object Object]')) {
                    console.warn('发现无效的JSON字符串，使用默认值:', jsonString);
                    return defaultValue;
                }

                try {
                    return JSON.parse(jsonString);
                } catch (error) {
                    console.warn('JSON解析失败，使用默认值:', error.message, jsonString);
                    return defaultValue;
                }
            }

            return defaultValue;
        };

        return {
            id: dbDigimon.id,
            name: dbDigimon.name,
            image: dbDigimon.image,
            positioning: dbDigimon.positioning,
            Type: dbDigimon.type,  // 注意：输出时使用大写Type保持兼容
            armor: dbDigimon.armor,
            fit: dbDigimon.fit,
            egg: dbDigimon.egg,
            time: dbDigimon.time,
            skills: safeJsonParse(dbDigimon.skills, [])
        };
    }

    // 按类型查询
    async getByType(type) {
        try {
            const digimons = await this.findAll({ type }, 'name');
            return digimons.map(this.formatDigimon);
        } catch (error) {
            console.error(`按类型查询数码兽失败 (${type}):`, error);
            throw error;
        }
    }

    // 按护甲查询
    async getByArmor(armor) {
        try {
            const digimons = await this.findAll({ armor }, 'name');
            return digimons.map(this.formatDigimon);
        } catch (error) {
            console.error(`按护甲查询数码兽失败 (${armor}):`, error);
            throw error;
        }
    }

    // 搜索数码兽（按名称）
    async searchByName(keyword) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE name LIKE ? ORDER BY name`;
            const results = await require('../config/database').query(sql, [`%${keyword}%`]);
            return results.map(this.formatDigimon);
        } catch (error) {
            console.error(`搜索数码兽失败 (${keyword}):`, error);
            throw error;
        }
    }

    // 删除数码兽
    async deleteDigimon(id) {
        try {
            return await this.delete(id);
        } catch (error) {
            console.error('删除数码兽失败:', error);
            throw error;
        }
    }
}

module.exports = new DigimonModel();
