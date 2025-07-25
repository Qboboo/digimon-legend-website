const BaseModel = require('./BaseModel');

class SynthesisModel extends BaseModel {
    constructor() {
        super('synthesis_recipes');
    }

    // 获取所有格式化的合成配方
    async getAllFormatted() {
        try {
            const recipes = await this.findAll();
            return recipes.map(this.formatRecipe);
        } catch (error) {
            console.error('获取格式化合成配方失败:', error);
            throw error;
        }
    }

    // 格式化合成配方数据（数据库 -> API格式）
    formatRecipe(dbRecipe) {
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

        // 适配实际的数据库表结构
        return {
            id: dbRecipe.id,
            targetItemId: dbRecipe.target_item_id,
            materials: safeJsonParse(dbRecipe.materials, [])
        };
    }

    // 创建合成配方
    async createRecipe(data) {
        try {
            // 适配实际的数据库表结构
            const recipeData = {
                id: data.id,
                target_item_id: data.targetItemId || data.target_item_id,
                materials: JSON.stringify(data.materials || [])
            };

            return await this.create(recipeData);
        } catch (error) {
            console.error('创建合成配方失败:', error);
            throw error;
        }
    }

    // 更新合成配方
    async updateRecipe(id, data) {
        try {
            const updateData = {};

            // 适配实际的数据库表结构
            if (data.targetItemId !== undefined || data.target_item_id !== undefined) {
                updateData.target_item_id = data.targetItemId || data.target_item_id;
            }
            if (data.materials !== undefined) {
                updateData.materials = JSON.stringify(data.materials);
            }

            return await this.update(id, updateData);
        } catch (error) {
            console.error('更新合成配方失败:', error);
            throw error;
        }
    }

    // 删除合成配方
    async deleteRecipe(id) {
        try {
            return await this.delete(id);
        } catch (error) {
            console.error('删除合成配方失败:', error);
            throw error;
        }
    }

    // 按分类查询合成配方
    async getByCategory(category) {
        try {
            const recipes = await this.findAll({ category });
            return recipes.map(this.formatRecipe);
        } catch (error) {
            console.error(`按分类查询合成配方失败 (${category}):`, error);
            throw error;
        }
    }

    // 搜索合成配方（按名称）
    async searchByName(keyword) {
        try {
            const recipes = await this.findAll();
            const filtered = recipes.filter(recipe => 
                recipe.name && recipe.name.toLowerCase().includes(keyword.toLowerCase())
            );
            return filtered.map(this.formatRecipe);
        } catch (error) {
            console.error(`搜索合成配方失败 (${keyword}):`, error);
            throw error;
        }
    }
}

module.exports = new SynthesisModel();
