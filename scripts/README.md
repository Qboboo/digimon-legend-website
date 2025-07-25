# 数码兽传说网站 - 数据迁移工具

这个工具用于将项目中的JSON数据文件迁移到SQL数据库（支持MySQL和PostgreSQL）。

## 功能特性

- ✅ 支持MySQL和PostgreSQL数据库
- ✅ 自动创建数据库表结构
- ✅ 批量迁移所有JSON数据
- ✅ 详细的迁移日志记录
- ✅ 错误处理和回滚机制
- ✅ 交互式配置界面

## 安装依赖

### Windows环境

```bash
# 安装Python依赖
pip install -r requirements.txt

# 如果只使用MySQL
pip install pymysql

# 如果只使用PostgreSQL
pip install psycopg2-binary
```

### Linux环境

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3-pip python3-dev

# 安装Python依赖
pip3 install -r requirements.txt

# 如果使用PostgreSQL，可能需要额外安装
sudo apt install libpq-dev
```

## 数据库准备

### MySQL

#### Windows (使用XAMPP或直接安装MySQL)

```sql
-- 创建数据库
CREATE DATABASE digimon_legend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户（可选，也可以使用root）
CREATE USER 'digimon_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON digimon_legend.* TO 'digimon_user'@'localhost';
FLUSH PRIVILEGES;
```

#### Linux

```bash
# 安装MySQL
sudo apt install mysql-server

# 安全配置
sudo mysql_secure_installation

# 登录MySQL
sudo mysql -u root -p

# 执行上面的SQL命令创建数据库和用户
```

### PostgreSQL

#### Windows

下载并安装PostgreSQL，然后：

```sql
-- 创建数据库
CREATE DATABASE digimon_legend;

-- 创建用户
CREATE USER digimon_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE digimon_legend TO digimon_user;
```

#### Linux

```bash
# 安装PostgreSQL
sudo apt install postgresql postgresql-contrib

# 切换到postgres用户
sudo -u postgres psql

# 执行上面的SQL命令
```

## 使用方法

### 1. 基本使用

```bash
# 运行迁移脚本
python migrate_json_to_sql.py

# 或者在Linux上
python3 migrate_json_to_sql.py
```

### 2. 配置数据库连接

脚本会提供交互式界面让您：
1. 选择数据库类型（MySQL或PostgreSQL）
2. 配置数据库连接参数
3. 确认开始迁移

### 3. 使用配置文件（高级）

```bash
# 复制配置文件模板
cp config.example.py config.py

# 编辑配置文件
nano config.py

# 修改脚本以使用配置文件
```

## 迁移的数据表

脚本会创建以下数据表：

| 表名 | 描述 | 源文件 |
|------|------|--------|
| `digimons` | 数码兽信息 | `digimon.json` |
| `evolutions` | 进化路线 | `evolutions.json` |
| `equipment` | 装备数据 | `equipment.json` |
| `items` | 物品数据 | `items.json` |
| `synthesis_recipes` | 合成配方 | `synthesis.json` |
| `guides` | 攻略指南 | `guides.json` |
| `changelogs` | 更新日志 | `changelog.json` |

## 日志文件

迁移过程会生成 `migration.log` 文件，包含：
- 迁移进度信息
- 错误详情
- 数据统计

## 注意事项

1. **备份数据**: 迁移前请备份原始JSON文件
2. **数据库权限**: 确保数据库用户有创建表和插入数据的权限
3. **字符编码**: 使用UTF-8编码处理中文内容
4. **JSON字段**: 复杂数据结构存储为JSON字段
5. **错误处理**: 单条数据错误不会中断整个迁移过程

## 故障排除

### 常见错误

1. **连接失败**
   ```
   ❌ 数据库连接失败: Access denied for user
   ```
   解决：检查用户名、密码和权限

2. **编码错误**
   ```
   ❌ UnicodeDecodeError
   ```
   解决：确保数据库使用UTF-8编码

3. **依赖缺失**
   ```
   ImportError: No module named 'pymysql'
   ```
   解决：安装相应的数据库驱动

### 重新运行迁移

如果需要重新运行迁移：
1. 脚本会自动删除现有表
2. 重新创建表结构
3. 重新导入所有数据

## 性能优化

对于大量数据，可以考虑：
1. 调整数据库连接池大小
2. 使用批量插入
3. 临时禁用索引和约束

## 扩展功能

脚本支持扩展以下功能：
- 增量迁移
- 数据验证
- 自定义字段映射
- 多数据库同步
