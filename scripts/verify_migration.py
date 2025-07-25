#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据迁移验证脚本
用于验证JSON数据是否正确迁移到数据库
"""

import json
import os
from pathlib import Path

# 使用与快速迁移脚本相同的配置
DB_CONFIG = {
    'type': 'mysql',  # 'mysql' 或 'postgresql'
    'host': 'localhost',
    'user': 'root',
    'password': '',  # 请填入您的数据库密码
    'database': 'digimon_legend',
    'port': 3306
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

def load_json_file(file_path):
    """加载JSON文件"""
    if not os.path.exists(file_path):
        return None
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ 加载文件失败 {file_path}: {e}")
        return None

def verify_table_count(cursor, table_name, expected_count, description):
    """验证表中的记录数量"""
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        actual_count = cursor.fetchone()[0]
        
        if actual_count == expected_count:
            print(f"✅ {description}: {actual_count}/{expected_count} 条记录")
            return True
        else:
            print(f"❌ {description}: {actual_count}/{expected_count} 条记录 (数量不匹配)")
            return False
    except Exception as e:
        print(f"❌ 验证 {description} 失败: {e}")
        return False

def verify_sample_data(cursor, table_name, sample_id, id_field='id'):
    """验证样本数据是否存在"""
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE {id_field} = %s", (sample_id,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            print(f"✅ {table_name} 样本数据 ({sample_id}) 存在")
            return True
        else:
            print(f"❌ {table_name} 样本数据 ({sample_id}) 不存在")
            return False
    except Exception as e:
        print(f"❌ 验证 {table_name} 样本数据失败: {e}")
        return False

def verify_json_fields(cursor, table_name, json_field, description):
    """验证JSON字段是否可以正确解析"""
    try:
        cursor.execute(f"SELECT {json_field} FROM {table_name} WHERE {json_field} IS NOT NULL LIMIT 5")
        results = cursor.fetchall()
        
        valid_count = 0
        for row in results:
            try:
                json.loads(row[0])
                valid_count += 1
            except:
                pass
        
        if valid_count == len(results):
            print(f"✅ {description} JSON字段格式正确")
            return True
        else:
            print(f"❌ {description} JSON字段格式有问题 ({valid_count}/{len(results)} 有效)")
            return False
    except Exception as e:
        print(f"❌ 验证 {description} JSON字段失败: {e}")
        return False

def main():
    """主验证函数"""
    print("🔍 数据迁移验证工具")
    print("=" * 40)
    
    if not DB_CONFIG['password']:
        print("⚠️  请先在脚本中配置数据库密码")
        return
    
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
    
    print("\n📊 开始验证数据...")
    
    all_passed = True
    
    # 验证数码兽数据
    print("\n1. 验证数码兽数据:")
    digimon_data = load_json_file(data_path / 'digimon.json')
    if digimon_data:
        if not verify_table_count(cursor, 'digimons', len(digimon_data), '数码兽数据'):
            all_passed = False
        if not verify_sample_data(cursor, 'digimons', digimon_data[0]['id']):
            all_passed = False
        if not verify_json_fields(cursor, 'digimons', 'skills', '数码兽技能'):
            all_passed = False
    
    # 验证进化数据
    print("\n2. 验证进化数据:")
    evolution_data = load_json_file(data_path / 'evolutions.json')
    if evolution_data:
        if not verify_table_count(cursor, 'evolutions', len(evolution_data), '进化数据'):
            all_passed = False
        first_evo_id = list(evolution_data.keys())[0]
        if not verify_sample_data(cursor, 'evolutions', first_evo_id):
            all_passed = False
        if not verify_json_fields(cursor, 'evolutions', 'stages', '进化阶段'):
            all_passed = False
    
    # 验证装备数据
    print("\n3. 验证装备数据:")
    equipment_data = load_json_file(data_path / 'equipment.json')
    if equipment_data:
        if not verify_table_count(cursor, 'equipment', len(equipment_data), '装备数据'):
            all_passed = False
        if not verify_sample_data(cursor, 'equipment', equipment_data[0]['dungeonId'], 'dungeon_id'):
            all_passed = False
        if not verify_json_fields(cursor, 'equipment', 'loose_items', '装备散件'):
            all_passed = False
    
    # 验证物品数据
    print("\n4. 验证物品数据:")
    items_data = load_json_file(data_path / 'items.json')
    if items_data:
        if not verify_table_count(cursor, 'items', len(items_data), '物品数据'):
            all_passed = False
        if not verify_sample_data(cursor, 'items', items_data[0]['id']):
            all_passed = False
    
    # 验证合成配方数据
    print("\n5. 验证合成配方数据:")
    synthesis_data = load_json_file(data_path / 'synthesis.json')
    if synthesis_data:
        if not verify_table_count(cursor, 'synthesis_recipes', len(synthesis_data), '合成配方数据'):
            all_passed = False
        if not verify_sample_data(cursor, 'synthesis_recipes', synthesis_data[0]['id']):
            all_passed = False
        if not verify_json_fields(cursor, 'synthesis_recipes', 'materials', '合成材料'):
            all_passed = False
    
    # 验证攻略指南数据
    print("\n6. 验证攻略指南数据:")
    guides_data = load_json_file(data_path / 'guides.json')
    if guides_data:
        if not verify_table_count(cursor, 'guides', len(guides_data), '攻略指南数据'):
            all_passed = False
        if not verify_sample_data(cursor, 'guides', guides_data[0]['slug'], 'slug'):
            all_passed = False
    
    # 验证更新日志数据
    print("\n7. 验证更新日志数据:")
    changelog_data = load_json_file(data_path / 'changelog.json')
    if changelog_data:
        if not verify_table_count(cursor, 'changelogs', len(changelog_data), '更新日志数据'):
            all_passed = False
        if not verify_sample_data(cursor, 'changelogs', changelog_data[0]['version'], 'version'):
            all_passed = False
        if not verify_json_fields(cursor, 'changelogs', 'changes', '更新内容'):
            all_passed = False
    
    # 总结
    print("\n" + "=" * 40)
    if all_passed:
        print("🎉 所有验证通过！数据迁移成功！")
    else:
        print("❌ 部分验证失败，请检查迁移过程")
    
    cursor.close()
    connection.close()

if __name__ == '__main__':
    main()
