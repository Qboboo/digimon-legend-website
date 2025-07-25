const fs = require('fs-extra');
const path = require('path');

// 数据模型
const DigimonModel = require('../models/DigimonModel');
const EvolutionModel = require('../models/EvolutionModel');
const ItemModel = require('../models/ItemModel');
const GuideModel = require('../models/GuideModel');
const SynthesisModel = require('../models/SynthesisModel');
const EquipmentModel = require('../models/EquipmentModel');
const ChangelogModel = require('../models/ChangelogModel');

// JSON文件路径
const DATA_PATH = path.join(__dirname, '../../frontend/js/data');

class DataSyncService {
    constructor() {
        this.config = {
            USE_DATABASE: process.env.USE_DATABASE !== 'false',
            FALLBACK_TO_JSON: process.env.FALLBACK_TO_JSON !== 'false',
            DUAL_WRITE: process.env.DUAL_WRITE !== 'false'
        };
    }

    // 读取数据（优先数据库，降级到JSON）
    async readData(type) {
        if (this.config.USE_DATABASE) {
            try {
                return await this.readFromDatabase(type);
            } catch (error) {
                console.warn(`数据库读取失败，降级到JSON文件: ${error.message}`);
                if (this.config.FALLBACK_TO_JSON) {
                    return await this.readFromJSON(type);
                }
                throw error;
            }
        } else {
            return await this.readFromJSON(type);
        }
    }

    // 写入数据（双写模式）
    async writeData(type, data, id = null) {
        const results = {
            database: null,
            json: null,
            success: false
        };

        if (this.config.USE_DATABASE) {
            try {
                results.database = await this.writeToDatabase(type, data, id);
            } catch (error) {
                console.error(`数据库写入失败: ${error.message}`);
                results.database = { error: error.message };
            }
        }

        if (this.config.DUAL_WRITE || !this.config.USE_DATABASE) {
            try {
                results.json = await this.writeToJSON(type, data, id);
            } catch (error) {
                console.error(`JSON文件写入失败: ${error.message}`);
                results.json = { error: error.message };
            }
        }

        // 至少一个写入成功就算成功
        results.success = (results.database && !results.database.error) || 
                         (results.json && !results.json.error);

        return results;
    }

    // 删除数据（双写模式）
    async deleteData(type, id) {
        const results = {
            database: null,
            json: null,
            success: false
        };

        if (this.config.USE_DATABASE) {
            try {
                results.database = await this.deleteFromDatabase(type, id);
            } catch (error) {
                console.error(`数据库删除失败: ${error.message}`);
                results.database = { error: error.message };
            }
        }

        if (this.config.DUAL_WRITE || !this.config.USE_DATABASE) {
            try {
                results.json = await this.deleteFromJSON(type, id);
            } catch (error) {
                console.error(`JSON文件删除失败: ${error.message}`);
                results.json = { error: error.message };
            }
        }

        // 至少一个删除成功就算成功
        results.success = (results.database && !results.database.error) ||
                         (results.json && !results.json.error);

        return results;
    }

    // 从数据库读取
    async readFromDatabase(type) {
        switch (type) {
            case 'digimons':
                return await DigimonModel.getAllFormatted();
            case 'evolutions':
                return await EvolutionModel.getAllFormatted();
            case 'items':
                return await ItemModel.getAllFormatted();
            case 'guides':
                return await GuideModel.getAllFormatted();
            case 'equipment':
                return await EquipmentModel.getAllFormatted();
            case 'synthesis':
                return await SynthesisModel.getAllFormatted();
            case 'changelog':
                return await ChangelogModel.getAllFormatted();
            default:
                throw new Error(`Unknown data type: ${type}`);
        }
    }

    // 从JSON文件读取
    async readFromJSON(type) {
        // 修正文件名映射
        const fileNameMap = {
            'digimons': 'digimon.json',
            'evolutions': 'evolutions.json',
            'items': 'items.json',
            'guides': 'guides.json',
            'equipment': 'equipment.json',
            'synthesis': 'synthesis.json',
            'changelog': 'changelog.json'
        };

        const fileName = fileNameMap[type] || `${type}.json`;
        const filePath = path.join(DATA_PATH, fileName);

        if (!await fs.pathExists(filePath)) {
            throw new Error(`JSON file not found: ${filePath}`);
        }

        return await fs.readJson(filePath);
    }

    // 写入数据库
    async writeToDatabase(type, data, id = null) {
        switch (type) {
            case 'digimons':
                if (id) {
                    return await DigimonModel.updateDigimon(id, data);
                } else {
                    return await DigimonModel.createDigimon(data);
                }
            case 'evolutions':
                const evolutionId = id || data.id;
                console.log(`🔍 进化数据操作: ID=${evolutionId}, 有传入ID=${!!id}`);

                if (id) {
                    // 更新现有数据
                    return await EvolutionModel.updateEvolution(id, data);
                } else {
                    // 创建新数据
                    return await EvolutionModel.createEvolution(evolutionId, data);
                }
            case 'items':
                if (id) {
                    return await ItemModel.updateItem(id, data);
                } else {
                    return await ItemModel.createItem(data);
                }
            case 'guides':
                console.log(`🔍 guides writeToDatabase - id: ${id} (type: ${typeof id}), data.slug: ${data.slug}`);
                if (id) {
                    // 判断ID类型：如果是数字则用original_id，如果是字符串或null则用slug
                    let updateResult;
                    if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) {
                        // 数字ID，使用original_id更新
                        console.log(`🔍 使用original_id更新: ${id}`);
                        updateResult = await GuideModel.updateGuide(id, data);
                    } else if (id === null || id === undefined) {
                        // ID为null，使用slug更新
                        console.log(`🔍 ID为null，使用slug更新: ${data.slug || 'unknown'}`);
                        if (data.slug) {
                            updateResult = await GuideModel.updateGuideBySlug(data.slug, data);
                        } else {
                            throw new Error('ID为null且没有提供slug，无法更新记录');
                        }
                    } else {
                        // 字符串ID，使用slug更新
                        console.log(`🔍 使用slug更新: ${id}`);
                        updateResult = await GuideModel.updateGuideBySlug(id, data);
                    }

                    console.log(`🔍 攻略更新结果: affectedRows=${updateResult.affectedRows}`);

                    if (updateResult.affectedRows === 0) {
                        console.log('⚠️  数据库中没有找到记录');
                        // 对于恢复操作，不要自动创建新记录
                        if (data.status === 'draft' && typeof id === 'string') {
                            console.log('❌ 恢复操作失败：数据库中找不到要恢复的记录');
                            throw new Error(`Guide with slug "${id}" not found in database`);
                        }
                        // 其他情况才创建新记录
                        console.log('🆕 尝试创建新记录');
                        return await GuideModel.createGuide(data);
                    } else if (updateResult.changedRows === 0) {
                        console.log('ℹ️  记录已存在且无需更新（状态相同）');
                        return updateResult;
                    }
                    return updateResult;
                } else {
                    return await GuideModel.createGuide(data);
                }
            case 'synthesis':
                if (id) {
                    return await SynthesisModel.updateRecipe(id, data);
                } else {
                    return await SynthesisModel.createRecipe(data);
                }
            case 'equipment':
                if (id) {
                    return await EquipmentModel.updateDungeon(id, data);
                } else {
                    return await EquipmentModel.createDungeon(data);
                }
            case 'changelog':
                if (id) {
                    return await ChangelogModel.updateChangelog(id, data);
                } else {
                    return await ChangelogModel.createChangelog(data);
                }
            default:
                throw new Error(`Database write not implemented for type: ${type}`);
        }
    }

    // 从数据库删除
    async deleteFromDatabase(type, id) {
        switch (type) {
            case 'digimons':
                console.log('🔍 DigimonModel:', DigimonModel);
                console.log('🔍 DigimonModel.deleteDigimon:', typeof DigimonModel.deleteDigimon);
                console.log('🔍 DigimonModel方法:', Object.getOwnPropertyNames(DigimonModel));

                if (typeof DigimonModel.deleteDigimon === 'function') {
                    return await DigimonModel.deleteDigimon(id);
                } else {
                    // 如果deleteDigimon方法不存在，直接调用BaseModel的delete方法
                    console.log('⚠️  使用BaseModel的delete方法');
                    return await DigimonModel.delete(id);
                }
            case 'evolutions':
                return await EvolutionModel.deleteEvolution(id);
            case 'items':
                return await ItemModel.deleteItem(id);
            case 'guides':
                return await GuideModel.deleteGuide(id);
            case 'synthesis':
                return await SynthesisModel.deleteRecipe(id);
            case 'equipment':
                return await EquipmentModel.deleteDungeon(id);
            case 'changelog':
                return await ChangelogModel.deleteChangelog(id);
            default:
                throw new Error(`Database delete not implemented for type: ${type}`);
        }
    }

    // 写入JSON文件
    async writeToJSON(type, data, id = null) {
        // 使用相同的文件名映射
        const fileNameMap = {
            'digimons': 'digimon.json',
            'evolutions': 'evolutions.json',
            'items': 'items.json',
            'guides': 'guides.json',
            'equipment': 'equipment.json',
            'synthesis': 'synthesis.json',
            'changelog': 'changelog.json'
        };

        const fileName = fileNameMap[type] || `${type}.json`;
        const filePath = path.join(DATA_PATH, fileName);

        // 读取现有数据
        let existingData = {};
        if (await fs.pathExists(filePath)) {
            existingData = await fs.readJson(filePath);
        }

        // 更新数据
        if (type === 'evolutions') {
            // 进化数据是对象格式
            if (id) {
                existingData[id] = data;
            } else if (data.id) {
                existingData[data.id] = data;
            }
        } else {
            // 其他数据是数组格式
            if (!Array.isArray(existingData)) {
                existingData = [];
            }

            if (id) {
                // 装备数据特殊处理
                if (type === 'equipment') {
                    const index = existingData.findIndex(item => item.dungeonId === id);
                    if (index !== -1) {
                        existingData[index] = { ...existingData[index], ...data };
                        console.log(`✅ JSON更新装备: dungeonId=${id}`);
                    } else {
                        existingData.push({ dungeonId: id, ...data });
                        console.log(`✅ JSON添加装备: dungeonId=${id}`);
                    }
                } else {
                    // 其他数据类型的处理
                    const index = existingData.findIndex(item => item.id === id);
                    if (index !== -1) {
                        existingData[index] = { ...existingData[index], ...data };
                    } else {
                        existingData.push({ id, ...data });
                    }
                }
            } else {
                // 添加新记录
                existingData.push(data);
            }
        }

        // 写入文件
        await fs.writeJson(filePath, existingData, { spaces: 2 });
        return { success: true };
    }

    // 从JSON文件删除
    async deleteFromJSON(type, id) {
        // 使用相同的文件名映射
        const fileNameMap = {
            'digimons': 'digimon.json',
            'evolutions': 'evolutions.json',
            'items': 'items.json',
            'guides': 'guides.json',
            'equipment': 'equipment.json',
            'synthesis': 'synthesis.json',
            'changelog': 'changelog.json'
        };

        const fileName = fileNameMap[type] || `${type}.json`;
        const filePath = path.join(DATA_PATH, fileName);

        // 读取现有数据
        let existingData = {};
        if (await fs.pathExists(filePath)) {
            existingData = await fs.readJson(filePath);
        }

        // 删除数据
        if (Array.isArray(existingData)) {
            // 数组格式（如数码兽、攻略）
            let index = -1;

            if (type === 'guides') {
                // 攻略特殊处理：先按slug查找，再按ID查找
                index = existingData.findIndex(item => item.slug === id);
                if (index === -1) {
                    index = existingData.findIndex(item => item.id === id);
                }
                console.log(`🔍 JSON删除攻略: 查找 ${id}, 找到索引: ${index}`);
            } else if (type === 'changelog') {
                // 日志特殊处理：按version查找
                index = existingData.findIndex(item => item.version === id);
                console.log(`🔍 JSON删除日志: 查找版本 ${id}, 找到索引: ${index}`);
            } else {
                // 其他类型按ID查找
                index = existingData.findIndex(item => item.id === id);
            }

            if (index !== -1) {
                const deletedItem = existingData[index];
                existingData.splice(index, 1);
                const identifier = deletedItem.id || deletedItem.slug || deletedItem.version || id;
                console.log(`✅ JSON删除成功: ${type}, 删除了 ${identifier}`);
            } else {
                console.log(`❌ JSON删除失败: ${type} 中未找到 ${id}`);
                throw new Error(`Record with ID "${id}" not found in ${type}`);
            }
        } else {
            // 对象格式（如进化）
            if (existingData[id]) {
                delete existingData[id];
                console.log(`✅ JSON删除成功: ${type}, 删除了 ${id}`);
            } else {
                console.log(`❌ JSON删除失败: ${type} 中未找到 ${id}`);
                throw new Error(`Record with ID "${id}" not found in ${type}`);
            }
        }

        // 写入文件
        await fs.writeJson(filePath, existingData, { spaces: 2 });
        return { success: true };
    }

    // 数据同步（数据库 -> JSON）
    async syncDatabaseToJSON() {
        const types = ['digimons', 'evolutions', 'items', 'guides'];
        const results = {};

        // 使用相同的文件名映射
        const fileNameMap = {
            'digimons': 'digimon.json',
            'evolutions': 'evolutions.json',
            'items': 'items.json',
            'guides': 'guides.json',
            'equipment': 'equipment.json',
            'synthesis': 'synthesis.json',
            'changelog': 'changelog.json'
        };

        for (const type of types) {
            try {
                const data = await this.readFromDatabase(type);
                const fileName = fileNameMap[type] || `${type}.json`;
                await fs.writeJson(
                    path.join(DATA_PATH, fileName),
                    data,
                    { spaces: 2 }
                );
                results[type] = { success: true };
            } catch (error) {
                results[type] = { error: error.message };
            }
        }

        return results;
    }

    // 数据验证（检查数据库和JSON的一致性）
    async validateDataConsistency() {
        const types = ['digimons', 'evolutions', 'items', 'guides'];
        const results = {};

        for (const type of types) {
            try {
                const dbData = await this.readFromDatabase(type);
                const jsonData = await this.readFromJSON(type);
                
                results[type] = {
                    dbCount: Array.isArray(dbData) ? dbData.length : Object.keys(dbData).length,
                    jsonCount: Array.isArray(jsonData) ? jsonData.length : Object.keys(jsonData).length,
                    consistent: JSON.stringify(dbData) === JSON.stringify(jsonData)
                };
            } catch (error) {
                results[type] = { error: error.message };
            }
        }

        return results;
    }
}

// 导出类和实例
module.exports = DataSyncService;
module.exports.instance = new DataSyncService();
