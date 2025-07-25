const BaseModel = require('./BaseModel');

class EquipmentModel extends BaseModel {
    constructor() {
        super('equipment');
    }

    // 获取所有格式化的装备地下城
    async getAllFormatted() {
        try {
            const dungeons = await this.findAll();
            return dungeons.map(this.formatDungeon);
        } catch (error) {
            console.error('获取格式化装备地下城失败:', error);
            throw error;
        }
    }

    // 格式化装备地下城数据（数据库 -> API格式）
    formatDungeon(dbDungeon) {
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

        // 根据实际表结构映射字段
        return {
            dungeonId: dbDungeon.dungeon_id,
            dungeonName: dbDungeon.dungeon_name,
            dungeonImage: dbDungeon.dungeon_image || '',  // 修正：输出为dungeonImage
            equipmentSets: safeJsonParse(dbDungeon.equipment_sets, []),
            looseItems: safeJsonParse(dbDungeon.loose_items, [])
        };
    }

    // 创建装备地下城
    async createDungeon(data) {
        try {
            const dungeonData = {
                dungeon_id: data.dungeonId,
                dungeon_name: data.dungeonName,
                dungeon_image: data.dungeonImage || '',  // 修正：从dungeonImage读取
                equipment_sets: JSON.stringify(data.equipmentSets || []),
                loose_items: JSON.stringify(data.looseItems || [])
            };

            return await this.create(dungeonData);
        } catch (error) {
            console.error('创建装备地下城失败:', error);
            throw error;
        }
    }

    // 更新装备地下城
    async updateDungeon(dungeonId, data) {
        try {
            const updateData = {};

            if (data.dungeonName !== undefined) {
                updateData.dungeon_name = data.dungeonName;
            }
            if (data.dungeonImage !== undefined) {  // 修正：从dungeonImage读取
                updateData.dungeon_image = data.dungeonImage;
            }
            if (data.equipmentSets !== undefined) {
                updateData.equipment_sets = JSON.stringify(data.equipmentSets);
            }
            if (data.looseItems !== undefined) {
                updateData.loose_items = JSON.stringify(data.looseItems);
            }

            return await this.update(dungeonId, updateData, 'dungeon_id');
        } catch (error) {
            console.error('更新装备地下城失败:', error);
            throw error;
        }
    }

    // 删除装备地下城
    async deleteDungeon(dungeonId) {
        try {
            return await this.delete(dungeonId, 'dungeon_id');
        } catch (error) {
            console.error('删除装备地下城失败:', error);
            throw error;
        }
    }

    // 按地下城ID查询
    async getByDungeonId(dungeonId) {
        try {
            const dungeons = await this.findAll({ dungeon_id: dungeonId });
            return dungeons.length > 0 ? this.formatDungeon(dungeons[0]) : null;
        } catch (error) {
            console.error(`按地下城ID查询失败 (${dungeonId}):`, error);
            throw error;
        }
    }

    // 搜索装备地下城（按名称）
    async searchByName(keyword) {
        try {
            const dungeons = await this.findAll();
            const filtered = dungeons.filter(dungeon => 
                dungeon.dungeon_name && dungeon.dungeon_name.toLowerCase().includes(keyword.toLowerCase())
            );
            return filtered.map(this.formatDungeon);
        } catch (error) {
            console.error(`搜索装备地下城失败 (${keyword}):`, error);
            throw error;
        }
    }
}

module.exports = new EquipmentModel();
