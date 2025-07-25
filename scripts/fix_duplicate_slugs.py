#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复重复slug的脚本
"""

import json
import os
from pathlib import Path

def fix_duplicate_slugs():
    """修复重复的slug"""
    project_root = Path(__file__).parent.parent
    guides_file = project_root / 'frontend' / 'js' / 'data' / 'guides.json'
    
    # 读取数据
    with open(guides_file, 'r', encoding='utf-8') as f:
        guides = json.load(f)
    
    print("🔍 检查重复的slug...")
    
    # 统计slug使用情况
    slug_count = {}
    for guide in guides:
        slug = guide.get('slug')
        if slug:
            if slug not in slug_count:
                slug_count[slug] = []
            slug_count[slug].append(guide)
    
    # 找出重复的slug
    duplicates = {slug: items for slug, items in slug_count.items() if len(items) > 1}
    
    if not duplicates:
        print("✅ 没有发现重复的slug")
        return
    
    print(f"❌ 发现 {len(duplicates)} 个重复的slug:")
    
    for slug, items in duplicates.items():
        print(f"\n重复slug: {slug}")
        for item in items:
            print(f"  - ID: {item.get('id')}, 标题: {item.get('title')}, 状态: {item.get('status')}, 分类: {item.get('category')}")
        
        # 修复策略：给trashed状态的记录添加后缀
        for i, item in enumerate(items):
            if item.get('status') == 'trashed':
                new_slug = f"{slug}-trashed-{item.get('id')}"
                print(f"  修复: ID {item.get('id')} 的slug改为: {new_slug}")
                item['slug'] = new_slug
    
    # 备份原文件
    backup_file = guides_file.with_suffix('.json.backup')
    with open(backup_file, 'w', encoding='utf-8') as f:
        json.dump(guides, f, ensure_ascii=False, indent=2)
    print(f"\n📁 原文件已备份到: {backup_file}")
    
    # 保存修复后的文件
    with open(guides_file, 'w', encoding='utf-8') as f:
        json.dump(guides, f, ensure_ascii=False, indent=2)
    
    print("✅ 重复slug已修复")

if __name__ == '__main__':
    fix_duplicate_slugs()
