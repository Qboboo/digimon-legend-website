#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
快速数据迁移脚本 - 用于测试和快速部署
只需要修改下面的数据库配置即可使用
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# 数据库配置 - 请修改为您的配置
DB_CONFIG = {
    'type': 'mysql',  # 'mysql' 或 'postgresql'
    'host': 'localhost',
    'user': 'root',
    'password': '',  # 请填入您的数据库密码
    'database': 'digimon_legend',
    'port': 3306  # MySQL默认3306，PostgreSQL默认5432
}

def install_and_import_db_driver():
    """自动安装并导入数据库驱动"""
    if DB_CONFIG['type'] == 'mysql':
        try:
            import pymysql
            return pymysql
        except ImportError:
            print("正在安装MySQL驱动...")
            os.system("pip install pymysql")
            import pymysql
            return pymysql
    else:
        try:
            import psycopg2
            return psycopg2
        except ImportError:
            print("正在安装PostgreSQL驱动...")
            os.system("pip install psycopg2-binary")
            import psycopg2
            return psycopg2

def connect_database():
    """连接数据库"""
    db_module = install_and_import_db_driver()
    
    if DB_CONFIG['type'] == 'mysql':
        connection = db_module.connect(
            host=DB_CONFIG['host'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
            charset='utf8mb4'
        )
    else:
        connection = db_module.connect(
            host=DB_CONFIG['host'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
            port=DB_CONFIG['port']
        )
    
    return connection

def create_mysql_tables(cursor):
    """创建MySQL表"""
    tables = {
        'digimons': """
            CREATE TABLE IF NOT EXISTS digimons (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        'evolutions': """
            CREATE TABLE IF NOT EXISTS evolutions (
                id VARCHAR(50) PRIMARY KEY,
                card_data JSON,
                main_data JSON,
                stages JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        'equipment': """
            CREATE TABLE IF NOT EXISTS equipment (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dungeon_id VARCHAR(50) NOT NULL UNIQUE,
                dungeon_name VARCHAR(100) NOT NULL,
                dungeon_image VARCHAR(500),
                equipment_sets JSON,
                loose_items JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        'items': """
            CREATE TABLE IF NOT EXISTS items (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50),
                image VARCHAR(500),
                description TEXT,
                acquisition_method TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        'synthesis_recipes': """
            CREATE TABLE IF NOT EXISTS synthesis_recipes (
                id VARCHAR(50) PRIMARY KEY,
                target_item_id VARCHAR(50) NOT NULL,
                materials JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        'guides': """
            CREATE TABLE IF NOT EXISTS guides (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        'changelogs': """
            CREATE TABLE IF NOT EXISTS changelogs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version VARCHAR(20) UNIQUE NOT NULL,
                date DATE NOT NULL,
                changes JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    }
    
    for table_name, sql in tables.items():
        cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
        cursor.execute(sql)
        print(f"✅ 创建表: {table_name}")

def load_json_file(file_path):
    """加载JSON文件"""
    if not os.path.exists(file_path):
        print(f"⚠️  文件不存在: {file_path}")
        return None
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ 加载文件失败 {file_path}: {e}")
        return None

def migrate_data():
    """执行数据迁移"""
    print("🚀 开始快速数据迁移...")
    
    # 项目路径
    project_root = Path(__file__).parent.parent
    data_path = project_root / 'frontend' / 'js' / 'data'
    
    # 连接数据库
    try:
        connection = connect_database()
        cursor = connection.cursor()
        print("✅ 数据库连接成功")
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return
    
    try:
        # 创建表
        if DB_CONFIG['type'] == 'mysql':
            create_mysql_tables(cursor)
        
        # 迁移数码兽数据
        digimon_data = load_json_file(data_path / 'digimon.json')
        if digimon_data:
            success_count = 0
            for item in digimon_data:
                try:
                    sql = """
                        INSERT INTO digimons (id, name, image, positioning, type, armor, fit, egg, time, skills)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    values = (
                        item.get('id'),
                        item.get('name'),
                        item.get('image'),
                        item.get('positioning'),
                        item.get('Type'),  # 注意：原数据中是大写的Type
                        item.get('armor'),
                        item.get('fit'),
                        item.get('egg'),
                        item.get('time'),
                        json.dumps(item.get('skills', []), ensure_ascii=False)
                    )
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入数码兽数据失败 (ID: {item.get('id', 'unknown')}): {e}")
            print(f"✅ 数码兽数据: {success_count}/{len(digimon_data)} 条")
        
        # 迁移进化数据
        evolution_data = load_json_file(data_path / 'evolutions.json')
        if evolution_data:
            success_count = 0
            for evo_id, evo_data in evolution_data.items():
                try:
                    sql = "INSERT INTO evolutions (id, card_data, main_data, stages) VALUES (%s, %s, %s, %s)"
                    values = (
                        evo_id,
                        json.dumps(evo_data.get('card', {}), ensure_ascii=False),
                        json.dumps(evo_data.get('main', {}), ensure_ascii=False),
                        json.dumps(evo_data.get('stages', []), ensure_ascii=False)
                    )
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入进化数据失败 (ID: {evo_id}): {e}")
            print(f"✅ 进化数据: {success_count}/{len(evolution_data)} 条")
        
        # 迁移装备数据
        equipment_data = load_json_file(data_path / 'equipment.json')
        if equipment_data:
            success_count = 0
            for item in equipment_data:
                try:
                    sql = """
                        INSERT INTO equipment (dungeon_id, dungeon_name, dungeon_image, equipment_sets, loose_items)
                        VALUES (%s, %s, %s, %s, %s)
                    """
                    values = (
                        item.get('dungeonId'),
                        item.get('dungeonName'),
                        item.get('dungeonImage'),
                        json.dumps(item.get('equipmentSets', []), ensure_ascii=False),
                        json.dumps(item.get('looseItems', []), ensure_ascii=False)
                    )
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入装备数据失败 (副本ID: {item.get('dungeonId', 'unknown')}): {e}")
            print(f"✅ 装备数据: {success_count}/{len(equipment_data)} 条")
        
        # 迁移物品数据
        items_data = load_json_file(data_path / 'items.json')
        if items_data:
            success_count = 0
            for item in items_data:
                try:
                    # 兼容两种字段名：acquisitionMethod 和 acquisition_method
                    acquisition_method = item.get('acquisitionMethod') or item.get('acquisition_method')

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
                        acquisition_method
                    )
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入物品数据失败 (ID: {item.get('id', 'unknown')}): {e}")
            print(f"✅ 物品数据: {success_count}/{len(items_data)} 条")

        # 迁移合成配方数据
        synthesis_data = load_json_file(data_path / 'synthesis.json')
        if synthesis_data:
            success_count = 0
            for item in synthesis_data:
                try:
                    sql = """
                        INSERT INTO synthesis_recipes (id, target_item_id, materials)
                        VALUES (%s, %s, %s)
                    """
                    values = (
                        item.get('id'),
                        item.get('targetItemId'),
                        json.dumps(item.get('materials', []), ensure_ascii=False)
                    )
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入合成配方数据失败 (ID: {item.get('id', 'unknown')}): {e}")
            print(f"✅ 合成配方数据: {success_count}/{len(synthesis_data)} 条")

        # 迁移攻略指南数据
        guides_data = load_json_file(data_path / 'guides.json')
        if guides_data:
            success_count = 0
            for item in guides_data:
                try:
                    # 处理日期字段
                    update_date = None
                    if item.get('updateDate'):
                        try:
                            # 转换日期格式 YYYY-MM-DD
                            from datetime import datetime
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
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入攻略数据失败 (ID: {item.get('id', 'unknown')}): {e}")
            print(f"✅ 攻略指南数据: {success_count}/{len(guides_data)} 条")

        # 迁移更新日志数据
        changelog_data = load_json_file(data_path / 'changelog.json')
        if changelog_data:
            success_count = 0
            for item in changelog_data:
                try:
                    # 处理日期
                    log_date = None
                    if item.get('date'):
                        try:
                            from datetime import datetime
                            log_date = datetime.strptime(item['date'], '%Y-%m-%d').date()
                        except:
                            pass

                    sql = """
                        INSERT INTO changelogs (version, date, changes)
                        VALUES (%s, %s, %s)
                    """
                    values = (
                        item.get('version'),
                        log_date,
                        json.dumps(item.get('changes', []), ensure_ascii=False)
                    )
                    cursor.execute(sql, values)
                    success_count += 1
                except Exception as e:
                    print(f"插入更新日志数据失败 (版本: {item.get('version', 'unknown')}): {e}")
            print(f"✅ 更新日志数据: {success_count}/{len(changelog_data)} 条")

        # 提交事务
        connection.commit()
        print("🎉 数据迁移完成！")
        
    except Exception as e:
        print(f"💥 迁移过程出错: {e}")
        connection.rollback()
    finally:
        cursor.close()
        connection.close()

if __name__ == '__main__':
    print("🔥 数码兽传说 - 快速数据迁移工具")
    print("=" * 40)
    print(f"数据库类型: {DB_CONFIG['type'].upper()}")
    print(f"数据库地址: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print(f"数据库名称: {DB_CONFIG['database']}")
    print("=" * 40)
    
    if not DB_CONFIG['password']:
        print("⚠️  请先在脚本中配置数据库密码")
        sys.exit(1)
    
    confirm = input("确认开始迁移? (y/N): ").strip().lower()
    if confirm == 'y':
        migrate_data()
    else:
        print("❌ 迁移已取消")
