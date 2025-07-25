const BaseModel = require('./BaseModel');

class GuideModel extends BaseModel {
    constructor() {
        super('guides');
    }

    // 获取所有攻略（格式化输出）
    async getAllFormatted() {
        try {
            const guides = await this.findAll({}, 'original_id');
            return guides.map(this.formatGuide);
        } catch (error) {
            console.error('获取格式化攻略数据失败:', error);
            throw error;
        }
    }

    // 根据原始ID获取攻略
    async getByOriginalId(originalId) {
        try {
            const guide = await this.findById(originalId, 'original_id');
            return guide ? this.formatGuide(guide) : null;
        } catch (error) {
            console.error(`获取攻略 ${originalId} 失败:`, error);
            throw error;
        }
    }

    // 根据slug获取攻略
    async getBySlug(slug) {
        try {
            const guide = await this.findById(slug, 'slug');
            return guide ? this.formatGuide(guide) : null;
        } catch (error) {
            console.error(`获取攻略 ${slug} 失败:`, error);
            throw error;
        }
    }

    // 创建攻略
    async createGuide(data) {
        try {
            const guideData = {
                original_id: data.id,
                title: data.title,
                slug: data.slug,
                category: data.category,
                difficulty: data.difficulty || null,
                summary: data.summary || null,
                content: data.content || null,
                content_type: data.contentType || 'html',
                status: data.status || 'draft',
                update_date: data.updateDate ? new Date(data.updateDate) : null
            };

            return await this.create(guideData);
        } catch (error) {
            console.error('创建攻略失败:', error);
            throw error;
        }
    }

    // 更新攻略（通过original_id）
    async updateGuide(originalId, data) {
        try {
            const updateData = {};

            if (data.title !== undefined) updateData.title = data.title;
            if (data.slug !== undefined) updateData.slug = data.slug;
            if (data.category !== undefined) updateData.category = data.category;
            if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
            if (data.summary !== undefined) updateData.summary = data.summary;
            if (data.content !== undefined) updateData.content = data.content;
            if (data.contentType !== undefined) updateData.content_type = data.contentType;
            if (data.status !== undefined) updateData.status = data.status;
            if (data.updateDate !== undefined) {
                updateData.update_date = data.updateDate ? new Date(data.updateDate) : null;
            }

            // 如果original_id为null，使用slug进行更新
            if (originalId === null || originalId === undefined) {
                console.log('⚠️  original_id为null，尝试通过slug更新');
                if (data.slug) {
                    return await this.updateGuideBySlug(data.slug, data);
                } else {
                    throw new Error('original_id为null且没有提供slug，无法更新记录');
                }
            }

            return await this.update(originalId, updateData, 'original_id');
        } catch (error) {
            console.error(`更新攻略 ${originalId} 失败:`, error);
            throw error;
        }
    }

    // 通过slug更新攻略
    async updateGuideBySlug(slug, data) {
        try {
            const updateData = {};

            if (data.title !== undefined) updateData.title = data.title;
            if (data.slug !== undefined) updateData.slug = data.slug;
            if (data.category !== undefined) updateData.category = data.category;
            if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
            if (data.summary !== undefined) updateData.summary = data.summary;
            if (data.content !== undefined) updateData.content = data.content;
            if (data.contentType !== undefined) updateData.content_type = data.contentType;
            if (data.status !== undefined) updateData.status = data.status;
            if (data.updateDate !== undefined) {
                updateData.update_date = data.updateDate ? new Date(data.updateDate) : null;
            }

            return await this.update(slug, updateData, 'slug');
        } catch (error) {
            console.error(`通过slug更新攻略 ${slug} 失败:`, error);
            throw error;
        }
    }

    // 格式化攻略数据（数据库 -> API格式）
    formatGuide(dbGuide) {
        return {
            id: dbGuide.original_id,
            title: dbGuide.title,
            slug: dbGuide.slug,
            category: dbGuide.category,
            difficulty: dbGuide.difficulty,
            summary: dbGuide.summary,
            content: dbGuide.content,
            contentType: dbGuide.content_type,
            status: dbGuide.status,
            updateDate: dbGuide.update_date ? dbGuide.update_date.toISOString().split('T')[0] : null,
            createdAt: dbGuide.created_at,
            updatedAt: dbGuide.updated_at
        };
    }

    // 按分类查询
    async getByCategory(category) {
        try {
            const guides = await this.findAll({ category }, 'original_id');
            return guides.map(this.formatGuide);
        } catch (error) {
            console.error(`按分类查询攻略失败 (${category}):`, error);
            throw error;
        }
    }

    // 按状态查询
    async getByStatus(status) {
        try {
            const guides = await this.findAll({ status }, 'original_id');
            return guides.map(this.formatGuide);
        } catch (error) {
            console.error(`按状态查询攻略失败 (${status}):`, error);
            throw error;
        }
    }

    // 搜索攻略（按标题）
    async searchByTitle(keyword) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE title LIKE ? ORDER BY original_id`;
            const results = await require('../config/database').query(sql, [`%${keyword}%`]);
            return results.map(this.formatGuide);
        } catch (error) {
            console.error(`搜索攻略失败 (${keyword}):`, error);
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
            console.error('获取攻略分类失败:', error);
            throw error;
        }
    }

    // 删除攻略（根据原始ID）
    async deleteByOriginalId(originalId) {
        try {
            return await this.delete(originalId, 'original_id');
        } catch (error) {
            console.error(`删除攻略 ${originalId} 失败:`, error);
            throw error;
        }
    }

    // 删除攻略（根据ID或slug）
    async deleteGuide(identifier) {
        try {
            console.log(`🔍 删除攻略请求: ${identifier}`);

            // 首先尝试按slug查找
            const guidesBySlug = await this.findAll({ slug: identifier });
            if (guidesBySlug.length > 0) {
                const guide = guidesBySlug[0];
                console.log(`✅ 按slug找到攻略: ID=${guide.id}, slug=${guide.slug}, title=${guide.title}`);
                const result = await this.delete(guide.id);
                console.log(`🔍 数据库删除结果:`, result);
                return result;
            }

            // 如果按slug找不到，尝试按ID查找
            if (typeof identifier === 'number' || /^\d+$/.test(identifier)) {
                console.log(`🔍 按ID查找攻略: ${identifier}`);
                const guide = await this.findById(identifier);
                if (guide) {
                    console.log(`✅ 按ID找到攻略: ID=${guide.id}, slug=${guide.slug}, title=${guide.title}`);
                    const result = await this.delete(guide.id);
                    console.log(`🔍 数据库删除结果:`, result);
                    return result;
                }
            }

            // 都找不到
            console.log(`❌ 未找到标识符为 ${identifier} 的攻略`);
            return { success: false, error: `Guide with identifier "${identifier}" not found`, affectedRows: 0 };
        } catch (error) {
            console.error(`删除攻略 ${identifier} 失败:`, error);
            throw error;
        }
    }
}

module.exports = new GuideModel();
