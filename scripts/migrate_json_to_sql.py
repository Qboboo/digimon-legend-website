#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数码兽传说网站 - JSON数据迁移到SQL数据库脚本
支持MySQL和PostgreSQL
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
import logging

# 数据库驱动选择
try:
    import pymysql
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False

try:
    import psycopg2
    import psycopg2.extras
    POSTGRESQL_AVAILABLE = True
except ImportError:
    POSTGRESQL_AVAILABLE = False

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('migration.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class DatabaseMigrator:
    def __init__(self, db_type='mysql', **db_config):
        self.db_type = db_type.lower()
        self.db_config = db_config
        self.connection = None
        self.cursor = None
        
        # 项目路径
        self.project_root = Path(__file__).parent.parent
        self.data_path = self.project_root / 'frontend' / 'js' / 'data'
        
    def connect(self):
        """连接数据库"""
        try:
            if self.db_type == 'mysql':
                if not MYSQL_AVAILABLE:
                    raise ImportError("请安装pymysql: pip install pymysql")
                
                self.connection = pymysql.connect(
                    host=self.db_config.get('host', 'localhost'),
                    user=self.db_config.get('user', 'root'),
                    password=self.db_config.get('password', ''),
                    database=self.db_config.get('database', 'digimon_legend'),
                    charset='utf8mb4',
                    autocommit=False
                )
                
            elif self.db_type == 'postgresql':
                if not POSTGRESQL_AVAILABLE:
                    raise ImportError("请安装psycopg2: pip install psycopg2-binary")
                
                self.connection = psycopg2.connect(
                    host=self.db_config.get('host', 'localhost'),
                    user=self.db_config.get('user', 'postgres'),
                    password=self.db_config.get('password', ''),
                    database=self.db_config.get('database', 'digimon_legend'),
                    port=self.db_config.get('port', 5432)
                )
                
            else:
                raise ValueError(f"不支持的数据库类型: {self.db_type}")
                
            self.cursor = self.connection.cursor()
            logger.info(f"✅ 成功连接到 {self.db_type.upper()} 数据库")
            
        except Exception as e:
            logger.error(f"❌ 数据库连接失败: {e}")
            raise
    
    def create_tables(self):
        """创建数据库表"""
        logger.info("🔨 开始创建数据库表...")
        
        if self.db_type == 'mysql':
            tables = self._get_mysql_tables()
        else:
            tables = self._get_postgresql_tables()
        
        for table_name, create_sql in tables.items():
            try:
                self.cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
                self.cursor.execute(create_sql)
                logger.info(f"✅ 创建表 {table_name}")
            except Exception as e:
                logger.error(f"❌ 创建表 {table_name} 失败: {e}")
                raise
        
        self.connection.commit()
        logger.info("🎉 所有表创建完成")
    
    def _get_mysql_tables(self):
        """MySQL表结构"""
        return {
            'digimons': """
                CREATE TABLE digimons (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    image VARCHAR(500),
                    positioning VARCHAR(50),
                    type VARCHAR(10),
                    armor VARCHAR(20),
                    fit VARCHAR(10),
                    egg VARCHAR(10),
                    time VARCHAR(20),
                    skills JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            
            'evolutions': """
                CREATE TABLE evolutions (
                    id VARCHAR(50) PRIMARY KEY,
                    card_data JSON,
                    main_data JSON,
                    stages JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            
            'equipment': """
                CREATE TABLE equipment (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    dungeon_id VARCHAR(50) NOT NULL,
                    dungeon_name VARCHAR(100) NOT NULL,
                    dungeon_image VARCHAR(500),
                    equipment_sets JSON,
                    loose_items JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_dungeon (dungeon_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            
            'items': """
                CREATE TABLE items (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    category VARCHAR(50),
                    image VARCHAR(500),
                    description TEXT,
                    acquisition_method TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            
            'synthesis_recipes': """
                CREATE TABLE synthesis_recipes (
                    id VARCHAR(50) PRIMARY KEY,
                    target_item_id VARCHAR(50) NOT NULL,
                    materials JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            
            'guides': """
                CREATE TABLE guides (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    original_id INT,
                    title VARCHAR(200) NOT NULL,
                    slug VARCHAR(200) UNIQUE NOT NULL,
                    category VARCHAR(50) NOT NULL,
                    difficulty VARCHAR(50),
                    summary TEXT,
                    content LONGTEXT,
                    content_type VARCHAR(20) DEFAULT 'html',
                    status VARCHAR(20) DEFAULT 'draft',
                    update_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            
            'changelogs': """
                CREATE TABLE changelogs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    version VARCHAR(20) UNIQUE NOT NULL,
                    date DATE NOT NULL,
                    changes JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        }
    
    def _get_postgresql_tables(self):
        """PostgreSQL表结构"""
        return {
            'digimons': """
                CREATE TABLE digimons (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    image VARCHAR(500),
                    positioning VARCHAR(50),
                    type VARCHAR(10),
                    armor VARCHAR(20),
                    fit VARCHAR(10),
                    egg VARCHAR(10),
                    time VARCHAR(20),
                    skills JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """,
            
            'evolutions': """
                CREATE TABLE evolutions (
                    id VARCHAR(50) PRIMARY KEY,
                    card_data JSONB,
                    main_data JSONB,
                    stages JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """,
            
            'equipment': """
                CREATE TABLE equipment (
                    id SERIAL PRIMARY KEY,
                    dungeon_id VARCHAR(50) NOT NULL UNIQUE,
                    dungeon_name VARCHAR(100) NOT NULL,
                    dungeon_image VARCHAR(500),
                    equipment_sets JSONB,
                    loose_items JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """,
            
            'items': """
                CREATE TABLE items (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    category VARCHAR(50),
                    image VARCHAR(500),
                    description TEXT,
                    acquisition_method TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """,
            
            'synthesis_recipes': """
                CREATE TABLE synthesis_recipes (
                    id VARCHAR(50) PRIMARY KEY,
                    target_item_id VARCHAR(50) NOT NULL,
                    materials JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """,
            
            'guides': """
                CREATE TABLE guides (
                    id SERIAL PRIMARY KEY,
                    original_id INTEGER,
                    title VARCHAR(200) NOT NULL,
                    slug VARCHAR(200) UNIQUE NOT NULL,
                    category VARCHAR(50) NOT NULL,
                    difficulty VARCHAR(50),
                    summary TEXT,
                    content TEXT,
                    content_type VARCHAR(20) DEFAULT 'html',
                    status VARCHAR(20) DEFAULT 'draft',
                    update_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """,
            
            'changelogs': """
                CREATE TABLE changelogs (
                    id SERIAL PRIMARY KEY,
                    version VARCHAR(20) UNIQUE NOT NULL,
                    date DATE NOT NULL,
                    changes JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
        }

    def load_json_data(self, filename):
        """加载JSON数据文件"""
        file_path = self.data_path / filename
        if not file_path.exists():
            logger.warning(f"⚠️  文件不存在: {file_path}")
            return None

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.info(f"📖 成功加载 {filename}, 数据量: {len(data) if isinstance(data, (list, dict)) else 'N/A'}")
            return data
        except Exception as e:
            logger.error(f"❌ 加载 {filename} 失败: {e}")
            return None

    def migrate_digimons(self):
        """迁移数码兽数据"""
        logger.info("🔄 开始迁移数码兽数据...")
        data = self.load_json_data('digimon.json')
        if not data:
            return

        for item in data:
            try:
                # 处理技能数据
                skills_json = json.dumps(item.get('skills', []), ensure_ascii=False)

                sql = """
                    INSERT INTO digimons (id, name, image, positioning, type, armor, fit, egg, time, skills)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """

                values = (
                    item.get('id'),
                    item.get('name'),
                    item.get('image'),
                    item.get('positioning'),
                    item.get('Type'),  # 注意原数据中是大写的Type
                    item.get('armor'),
                    item.get('fit'),
                    item.get('egg'),
                    item.get('time'),
                    skills_json
                )

                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入数码兽数据失败: {e}, 数据: {item.get('id', 'unknown')}")

        self.connection.commit()
        logger.info(f"✅ 数码兽数据迁移完成，共 {len(data)} 条")

    def migrate_evolutions(self):
        """迁移进化数据"""
        logger.info("🔄 开始迁移进化数据...")
        data = self.load_json_data('evolutions.json')
        if not data:
            return

        for evo_id, evo_data in data.items():
            try:
                card_data = json.dumps(evo_data.get('card', {}), ensure_ascii=False)
                main_data = json.dumps(evo_data.get('main', {}), ensure_ascii=False)
                stages_data = json.dumps(evo_data.get('stages', []), ensure_ascii=False)

                sql = """
                    INSERT INTO evolutions (id, card_data, main_data, stages)
                    VALUES (%s, %s, %s, %s)
                """

                values = (evo_id, card_data, main_data, stages_data)
                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入进化数据失败: {e}, ID: {evo_id}")

        self.connection.commit()
        logger.info(f"✅ 进化数据迁移完成，共 {len(data)} 条")

    def migrate_equipment(self):
        """迁移装备数据"""
        logger.info("🔄 开始迁移装备数据...")
        data = self.load_json_data('equipment.json')
        if not data:
            return

        for item in data:
            try:
                equipment_sets = json.dumps(item.get('equipmentSets', []), ensure_ascii=False)
                loose_items = json.dumps(item.get('looseItems', []), ensure_ascii=False)

                sql = """
                    INSERT INTO equipment (dungeon_id, dungeon_name, dungeon_image, equipment_sets, loose_items)
                    VALUES (%s, %s, %s, %s, %s)
                """

                values = (
                    item.get('dungeonId'),
                    item.get('dungeonName'),
                    item.get('dungeonImage'),
                    equipment_sets,
                    loose_items
                )

                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入装备数据失败: {e}, 副本ID: {item.get('dungeonId', 'unknown')}")

        self.connection.commit()
        logger.info(f"✅ 装备数据迁移完成，共 {len(data)} 条")

    def migrate_items(self):
        """迁移物品数据"""
        logger.info("🔄 开始迁移物品数据...")
        data = self.load_json_data('items.json')
        if not data:
            return

        for item in data:
            try:
                sql = """
                    INSERT INTO items (id, name, category, image, description, acquisition_method)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """

                values = (
                    item.get('id'),
                    item.get('name'),
                    item.get('category'),
                    item.get('image'),
                    item.get('description'),
                    item.get('acquisitionMethod', item.get('acquisition_method'))  # 兼容两种字段名
                )

                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入物品数据失败: {e}, ID: {item.get('id', 'unknown')}")

        self.connection.commit()
        logger.info(f"✅ 物品数据迁移完成，共 {len(data)} 条")

    def migrate_synthesis(self):
        """迁移合成配方数据"""
        logger.info("🔄 开始迁移合成配方数据...")
        data = self.load_json_data('synthesis.json')
        if not data:
            return

        for item in data:
            try:
                materials = json.dumps(item.get('materials', []), ensure_ascii=False)

                sql = """
                    INSERT INTO synthesis_recipes (id, target_item_id, materials)
                    VALUES (%s, %s, %s)
                """

                values = (
                    item.get('id'),
                    item.get('targetItemId'),
                    materials
                )

                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入合成配方数据失败: {e}, ID: {item.get('id', 'unknown')}")

        self.connection.commit()
        logger.info(f"✅ 合成配方数据迁移完成，共 {len(data)} 条")

    def migrate_guides(self):
        """迁移攻略指南数据"""
        logger.info("🔄 开始迁移攻略指南数据...")
        data = self.load_json_data('guides.json')
        if not data:
            return

        for item in data:
            try:
                # 处理日期字段
                update_date = None
                if item.get('updateDate'):
                    try:
                        update_date = datetime.strptime(item['updateDate'], '%Y-%m-%d').date()
                    except:
                        pass

                sql = """
                    INSERT INTO guides (original_id, title, slug, category, difficulty, summary,
                                      content, content_type, status, update_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """

                values = (
                    item.get('id'),
                    item.get('title'),
                    item.get('slug'),
                    item.get('category'),
                    item.get('difficulty'),
                    item.get('summary'),
                    item.get('content'),
                    item.get('contentType', 'html'),
                    item.get('status', 'draft'),
                    update_date
                )

                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入攻略数据失败: {e}, ID: {item.get('id', 'unknown')}")

        self.connection.commit()
        logger.info(f"✅ 攻略指南数据迁移完成，共 {len(data)} 条")

    def migrate_changelogs(self):
        """迁移更新日志数据"""
        logger.info("🔄 开始迁移更新日志数据...")
        data = self.load_json_data('changelog.json')
        if not data:
            return

        for item in data:
            try:
                # 处理日期
                log_date = None
                if item.get('date'):
                    try:
                        log_date = datetime.strptime(item['date'], '%Y-%m-%d').date()
                    except:
                        pass

                changes = json.dumps(item.get('changes', []), ensure_ascii=False)

                sql = """
                    INSERT INTO changelogs (version, date, changes)
                    VALUES (%s, %s, %s)
                """

                values = (
                    item.get('version'),
                    log_date,
                    changes
                )

                self.cursor.execute(sql, values)

            except Exception as e:
                logger.error(f"❌ 插入更新日志数据失败: {e}, 版本: {item.get('version', 'unknown')}")

        self.connection.commit()
        logger.info(f"✅ 更新日志数据迁移完成，共 {len(data)} 条")

    def run_migration(self):
        """执行完整的数据迁移"""
        logger.info("🚀 开始数据迁移...")
        start_time = datetime.now()

        try:
            # 连接数据库
            self.connect()

            # 创建表
            self.create_tables()

            # 迁移各类数据
            self.migrate_digimons()
            self.migrate_evolutions()
            self.migrate_equipment()
            self.migrate_items()
            self.migrate_synthesis()
            self.migrate_guides()
            self.migrate_changelogs()

            end_time = datetime.now()
            duration = end_time - start_time
            logger.info(f"🎉 数据迁移完成！耗时: {duration}")

        except Exception as e:
            logger.error(f"💥 数据迁移失败: {e}")
            if self.connection:
                self.connection.rollback()
            raise
        finally:
            self.close()

    def close(self):
        """关闭数据库连接"""
        if self.cursor:
            self.cursor.close()
        if self.connection:
            self.connection.close()
        logger.info("📴 数据库连接已关闭")


def main():
    """主函数"""
    print("🔥 数码兽传说网站 - 数据迁移工具")
    print("=" * 50)

    # 数据库配置
    db_configs = {
        'mysql': {
            'host': 'localhost',
            'user': 'root',
            'password': '',  # 请修改为您的密码
            'database': 'digimon_legend'
        },
        'postgresql': {
            'host': 'localhost',
            'user': 'postgres',
            'password': '',  # 请修改为您的密码
            'database': 'digimon_legend',
            'port': 5432
        }
    }

    # 选择数据库类型
    print("请选择数据库类型:")
    print("1. MySQL")
    print("2. PostgreSQL")

    choice = input("请输入选择 (1 或 2): ").strip()

    if choice == '1':
        db_type = 'mysql'
        if not MYSQL_AVAILABLE:
            print("❌ 请先安装MySQL驱动: pip install pymysql")
            return
    elif choice == '2':
        db_type = 'postgresql'
        if not POSTGRESQL_AVAILABLE:
            print("❌ 请先安装PostgreSQL驱动: pip install psycopg2-binary")
            return
    else:
        print("❌ 无效选择")
        return

    # 获取数据库配置
    config = db_configs[db_type].copy()

    print(f"\n当前配置 ({db_type.upper()}):")
    for key, value in config.items():
        if key == 'password':
            display_value = '*' * len(value) if value else '(空)'
        else:
            display_value = value
        print(f"  {key}: {display_value}")

    # 确认是否修改配置
    modify = input("\n是否需要修改配置? (y/N): ").strip().lower()
    if modify == 'y':
        for key in config.keys():
            if key == 'password':
                new_value = input(f"请输入 {key} (当前: {'*' * len(config[key]) if config[key] else '(空)'}): ").strip()
            else:
                new_value = input(f"请输入 {key} (当前: {config[key]}): ").strip()

            if new_value:
                if key == 'port':
                    config[key] = int(new_value)
                else:
                    config[key] = new_value

    # 确认开始迁移
    print(f"\n准备迁移数据到 {db_type.upper()} 数据库...")
    confirm = input("确认开始迁移? (y/N): ").strip().lower()
    if confirm != 'y':
        print("❌ 迁移已取消")
        return

    # 执行迁移
    migrator = DatabaseMigrator(db_type, **config)
    migrator.run_migration()


if __name__ == '__main__':
    main()
