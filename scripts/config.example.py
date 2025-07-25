#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库配置示例文件
复制此文件为 config.py 并修改相应配置
"""

# MySQL 配置
MYSQL_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'your_mysql_password',  # 请修改为您的MySQL密码
    'database': 'digimon_legend',
    'port': 3306
}

# PostgreSQL 配置
POSTGRESQL_CONFIG = {
    'host': 'localhost',
    'user': 'postgres',
    'password': 'your_postgresql_password',  # 请修改为您的PostgreSQL密码
    'database': 'digimon_legend',
    'port': 5432
}

# Linux 服务器配置示例
LINUX_MYSQL_CONFIG = {
    'host': 'localhost',
    'user': 'digimon_user',
    'password': 'secure_password_here',
    'database': 'digimon_legend',
    'port': 3306
}

LINUX_POSTGRESQL_CONFIG = {
    'host': 'localhost',
    'user': 'digimon_user',
    'password': 'secure_password_here',
    'database': 'digimon_legend',
    'port': 5432
}
