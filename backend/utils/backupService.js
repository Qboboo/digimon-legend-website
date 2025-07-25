const fs = require('fs-extra');
const path = require('path');

class BackupService {
    constructor() {
        this.DATA_PATH = path.join(__dirname, '../../frontend/js/data');
        this.BACKUP_PATH = path.join(__dirname, '../../backups');
        
        // 确保备份目录存在
        fs.ensureDirSync(this.BACKUP_PATH);
    }

    // 创建单个文件备份
    async backupFile(fileName, customSuffix = null) {
        try {
            const sourceFile = path.join(this.DATA_PATH, fileName);
            
            if (!await fs.pathExists(sourceFile)) {
                throw new Error(`Source file not found: ${fileName}`);
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const suffix = customSuffix || timestamp;
            const backupFileName = `${path.parse(fileName).name}_${suffix}.json`;
            const backupFile = path.join(this.BACKUP_PATH, backupFileName);

            await fs.copy(sourceFile, backupFile);
            
            console.log(`✅ 备份成功: ${fileName} -> ${backupFileName}`);
            return {
                success: true,
                sourceFile: fileName,
                backupFile: backupFileName,
                backupPath: backupFile
            };
        } catch (error) {
            console.error(`❌ 备份失败: ${fileName}`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 创建所有JSON文件的备份
    async backupAllFiles(customSuffix = null) {
        const jsonFiles = [
            'digimon.json',
            'evolutions.json',
            'items.json',
            'guides.json',
            'equipment.json',
            'synthesis.json',
            'changelog.json'
        ];

        const results = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const suffix = customSuffix || timestamp;

        console.log(`🔄 开始备份所有JSON文件 (${suffix})...`);

        for (const fileName of jsonFiles) {
            const result = await this.backupFile(fileName, suffix);
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`\n📊 备份完成: ${successCount} 成功, ${failCount} 失败`);
        
        return {
            timestamp: suffix,
            results,
            summary: {
                total: results.length,
                success: successCount,
                failed: failCount
            }
        };
    }

    // 恢复备份文件
    async restoreBackup(backupFileName, targetFileName = null) {
        try {
            const backupFile = path.join(this.BACKUP_PATH, backupFileName);
            
            if (!await fs.pathExists(backupFile)) {
                throw new Error(`Backup file not found: ${backupFileName}`);
            }

            // 如果没有指定目标文件名，从备份文件名推断
            if (!targetFileName) {
                const match = backupFileName.match(/^(.+)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.json$/);
                if (match) {
                    targetFileName = `${match[1]}.json`;
                } else {
                    throw new Error(`Cannot determine target filename from: ${backupFileName}`);
                }
            }

            const targetFile = path.join(this.DATA_PATH, targetFileName);
            
            // 在恢复前先备份当前文件
            if (await fs.pathExists(targetFile)) {
                await this.backupFile(targetFileName, 'before-restore');
            }

            await fs.copy(backupFile, targetFile);
            
            console.log(`✅ 恢复成功: ${backupFileName} -> ${targetFileName}`);
            return {
                success: true,
                backupFile: backupFileName,
                targetFile: targetFileName
            };
        } catch (error) {
            console.error(`❌ 恢复失败: ${backupFileName}`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 列出所有备份文件
    async listBackups() {
        try {
            const files = await fs.readdir(this.BACKUP_PATH);
            const backups = files
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(this.BACKUP_PATH, file);
                    const stats = fs.statSync(filePath);
                    
                    // 解析文件名获取信息
                    const match = file.match(/^(.+)_(.+)\.json$/);
                    const originalName = match ? match[1] : file;
                    const timestamp = match ? match[2] : 'unknown';
                    
                    return {
                        fileName: file,
                        originalName: originalName + '.json',
                        timestamp,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created); // 按创建时间倒序

            return backups;
        } catch (error) {
            console.error('❌ 获取备份列表失败:', error.message);
            return [];
        }
    }

    // 清理旧备份（保留最近N个）
    async cleanupOldBackups(keepCount = 10) {
        try {
            const backups = await this.listBackups();
            const groupedBackups = {};

            // 按原始文件名分组
            backups.forEach(backup => {
                if (!groupedBackups[backup.originalName]) {
                    groupedBackups[backup.originalName] = [];
                }
                groupedBackups[backup.originalName].push(backup);
            });

            let deletedCount = 0;
            
            for (const [originalName, fileBackups] of Object.entries(groupedBackups)) {
                if (fileBackups.length > keepCount) {
                    const toDelete = fileBackups.slice(keepCount);
                    
                    for (const backup of toDelete) {
                        const backupPath = path.join(this.BACKUP_PATH, backup.fileName);
                        await fs.remove(backupPath);
                        deletedCount++;
                        console.log(`🗑️  删除旧备份: ${backup.fileName}`);
                    }
                }
            }

            console.log(`🧹 清理完成: 删除了 ${deletedCount} 个旧备份文件`);
            return { deletedCount };
        } catch (error) {
            console.error('❌ 清理备份失败:', error.message);
            return { error: error.message };
        }
    }

    // 获取备份统计信息
    async getBackupStats() {
        try {
            const backups = await this.listBackups();
            const stats = {
                totalBackups: backups.length,
                totalSize: backups.reduce((sum, backup) => sum + backup.size, 0),
                byFile: {},
                oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
                newestBackup: backups.length > 0 ? backups[0].created : null
            };

            // 按文件统计
            backups.forEach(backup => {
                if (!stats.byFile[backup.originalName]) {
                    stats.byFile[backup.originalName] = {
                        count: 0,
                        size: 0,
                        newest: null,
                        oldest: null
                    };
                }
                
                const fileStats = stats.byFile[backup.originalName];
                fileStats.count++;
                fileStats.size += backup.size;
                
                if (!fileStats.newest || backup.created > fileStats.newest) {
                    fileStats.newest = backup.created;
                }
                if (!fileStats.oldest || backup.created < fileStats.oldest) {
                    fileStats.oldest = backup.created;
                }
            });

            return stats;
        } catch (error) {
            console.error('❌ 获取备份统计失败:', error.message);
            return null;
        }
    }
}

module.exports = new BackupService();
