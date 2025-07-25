const BaseModel = require('./BaseModel');

class EvolutionModel extends BaseModel {
    constructor() {
        super('evolutions');
    }

    // 获取所有进化数据（兼容原JSON格式）
    async getAllFormatted() {
        try {
            const evolutions = await this.findAll({}, 'id');
            
            // 转换为原来的对象格式 { "guilmon": {...}, "agumon": {...} }
            const formattedData = {};
            evolutions.forEach(evo => {
                formattedData[evo.id] = this.formatEvolution(evo);
            });
            
            return formattedData;
        } catch (error) {
            console.error('获取格式化进化数据失败:', error);
            throw error;
        }
    }

    // 根据ID获取进化数据
    async getByIdFormatted(id) {
        try {
            const evolution = await this.findById(id);
            return evolution ? this.formatEvolution(evolution) : null;
        } catch (error) {
            console.error(`获取进化数据 ${id} 失败:`, error);
            throw error;
        }
    }

    // 创建进化数据（使用UPSERT避免主键冲突）
    async createEvolution(id, data) {
        try {
            const evolutionData = {
                id: id,
                card_data: JSON.stringify(data.card || {}),
                main_data: JSON.stringify(data.main || {}),
                stages: JSON.stringify(data.stages || []),
                connections: JSON.stringify(data.connections || []),
                acquisition: JSON.stringify(data.acquisition || [])
            };

            // 使用UPSERT语法
            const keys = Object.keys(evolutionData);
            const values = Object.values(evolutionData);
            const placeholders = keys.map(() => '?').join(',');
            const updateClause = keys.filter(k => k !== 'id').map(k => `${k} = VALUES(${k})`).join(',');

            const sql = `INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${placeholders})
                        ON DUPLICATE KEY UPDATE ${updateClause}`;

            console.log(`🔍 执行UPSERT SQL: ${sql}`);
            console.log(`🔍 参数:`, values);

            const { query } = require('../config/database');
            const result = await query(sql, values);
            console.log(`🔍 UPSERT执行结果:`, result);

            return {
                success: true,
                insertId: result.insertId,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            console.error('创建进化数据失败:', error);
            throw error;
        }
    }

    // 更新进化数据
    async updateEvolution(id, data) {
        try {
            const updateData = {};
            
            if (data.card !== undefined) {
                updateData.card_data = JSON.stringify(data.card);
            }
            if (data.main !== undefined) {
                updateData.main_data = JSON.stringify(data.main);
            }
            if (data.stages !== undefined) {
                updateData.stages = JSON.stringify(data.stages);
            }
            if (data.connections !== undefined) {
                updateData.connections = JSON.stringify(data.connections);
            }
            if (data.acquisition !== undefined) {
                updateData.acquisition = JSON.stringify(data.acquisition);
            }

            return await this.update(id, updateData);
        } catch (error) {
            console.error(`更新进化数据 ${id} 失败:`, error);
            throw error;
        }
    }

    // 格式化进化数据（数据库 -> API格式）
    formatEvolution(dbEvolution) {
        // 安全的JSON解析函数
        const safeJsonParse = (jsonString, defaultValue = {}) => {
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
            card: safeJsonParse(dbEvolution.card_data, {}),
            main: safeJsonParse(dbEvolution.main_data, {}),
            stages: safeJsonParse(dbEvolution.stages, []),
            connections: safeJsonParse(dbEvolution.connections, []),
            acquisition: safeJsonParse(dbEvolution.acquisition, [])
        };
    }

    // 获取进化阶段数据
    async getStages(id) {
        try {
            const evolution = await this.findById(id);
            if (!evolution) return [];
            
            return evolution.stages ? JSON.parse(evolution.stages) : [];
        } catch (error) {
            console.error(`获取进化阶段失败 (${id}):`, error);
            throw error;
        }
    }

    // 更新进化阶段
    async updateStages(id, stages) {
        try {
            const updateData = {
                stages: JSON.stringify(stages)
            };

            return await this.update(id, updateData);
        } catch (error) {
            console.error(`更新进化阶段失败 (${id}):`, error);
            throw error;
        }
    }

    // 获取卡片数据
    async getCardData(id) {
        try {
            const evolution = await this.findById(id);
            if (!evolution) return {};
            
            return evolution.card_data ? JSON.parse(evolution.card_data) : {};
        } catch (error) {
            console.error(`获取卡片数据失败 (${id}):`, error);
            throw error;
        }
    }

    // 更新卡片数据
    async updateCardData(id, cardData) {
        try {
            const updateData = {
                card_data: JSON.stringify(cardData)
            };

            return await this.update(id, updateData);
        } catch (error) {
            console.error(`更新卡片数据失败 (${id}):`, error);
            throw error;
        }
    }

    // 获取主要数据
    async getMainData(id) {
        try {
            const evolution = await this.findById(id);
            if (!evolution) return {};
            
            return evolution.main_data ? JSON.parse(evolution.main_data) : {};
        } catch (error) {
            console.error(`获取主要数据失败 (${id}):`, error);
            throw error;
        }
    }

    // 更新主要数据
    async updateMainData(id, mainData) {
        try {
            const updateData = {
                main_data: JSON.stringify(mainData)
            };

            return await this.update(id, updateData);
        } catch (error) {
            console.error(`更新主要数据失败 (${id}):`, error);
            throw error;
        }
    }

    // 删除进化数据
    async deleteEvolution(id) {
        try {
            return await this.delete(id);
        } catch (error) {
            console.error('删除进化数据失败:', error);
            throw error;
        }
    }
}

module.exports = new EvolutionModel();
