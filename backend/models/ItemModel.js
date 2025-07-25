const BaseModel = require('./BaseModel');

class ItemModel extends BaseModel {
    constructor() {
        super('items');
    }

    // 获取所有物品（格式化输出）
    async getAllFormatted() {
        try {
            const items = await this.findAll({}, 'name');
            return items.map(this.formatItem);
        } catch (error) {
            console.error('获取格式化物品数据失败:', error);
            throw error;
        }
    }

    // 根据ID获取物品（格式化输出）
    async getByIdFormatted(id) {
        try {
            const item = await this.findById(id);
            return item ? this.formatItem(item) : null;
        } catch (error) {
            console.error(`获取物品 ${id} 失败:`, error);
            throw error;
        }
    }

    // 创建物品
    async createItem(data) {
        try {
            const itemData = {
                id: data.id,
                name: data.name,
                category: data.category || null,
                image: data.image || null,
                description: data.description || null,
                acquisition_method: data.acquisitionMethod || data.acquisition_method || null
            };

            return await this.create(itemData);
        } catch (error) {
            console.error('创建物品失败:', error);
            throw error;
        }
    }

    // 更新物品
    async updateItem(id, data) {
        try {
            const updateData = {};
            
            if (data.name !== undefined) updateData.name = data.name;
            if (data.category !== undefined) updateData.category = data.category;
            if (data.image !== undefined) updateData.image = data.image;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.acquisitionMethod !== undefined || data.acquisition_method !== undefined) {
                updateData.acquisition_method = data.acquisitionMethod || data.acquisition_method;
            }

            return await this.update(id, updateData);
        } catch (error) {
            console.error(`更新物品 ${id} 失败:`, error);
            throw error;
        }
    }

    // 格式化物品数据（数据库 -> API格式）
    formatItem(dbItem) {
        return {
            id: dbItem.id,
            name: dbItem.name,
            category: dbItem.category,
            image: dbItem.image,
            description: dbItem.description,
            acquisitionMethod: dbItem.acquisition_method  // 统一使用驼峰命名
        };
    }

    // 按分类查询
    async getByCategory(category) {
        try {
            const items = await this.findAll({ category }, 'name');
            return items.map(this.formatItem);
        } catch (error) {
            console.error(`按分类查询物品失败 (${category}):`, error);
            throw error;
        }
    }

    // 搜索物品（按名称）
    async searchByName(keyword) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE name LIKE ? ORDER BY name`;
            const results = await require('../config/database').query(sql, [`%${keyword}%`]);
            return results.map(this.formatItem);
        } catch (error) {
            console.error(`搜索物品失败 (${keyword}):`, error);
            throw error;
        }
    }

    // 获取所有分类
    async getCategories() {
        try {
            const sql = `SELECT DISTINCT category FROM ${this.tableName} WHERE category IS NOT NULL ORDER BY category`;
            const results = await require('../config/database').query(sql);
            return results.map(row => row.category);
        } catch (error) {
            console.error('获取物品分类失败:', error);
            throw error;
        }
    }

    // 删除物品
    async deleteItem(id) {
        try {
            return await this.delete(id);
        } catch (error) {
            console.error('删除物品失败:', error);
            throw error;
        }
    }
}

module.exports = new ItemModel();
