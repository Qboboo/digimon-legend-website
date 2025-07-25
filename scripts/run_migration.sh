#!/bin/bash
# 数码兽传说网站 - Linux数据迁移脚本

echo "🔥 数码兽传说网站 - 数据迁移工具"
echo "====================================="
echo

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到Python3，正在安装..."
    sudo apt update
    sudo apt install -y python3 python3-pip
fi

echo "✅ Python环境正常"
echo

# 检查是否在正确的目录
if [ ! -f "migrate_json_to_sql.py" ]; then
    echo "❌ 请在scripts目录下运行此脚本"
    exit 1
fi

echo "选择迁移方式:"
echo "1. 快速迁移 (推荐，适合测试)"
echo "2. 完整迁移 (功能完整，适合生产环境)"
echo

read -p "请输入选择 (1 或 2): " choice

case $choice in
    1)
        echo
        echo "🚀 启动快速迁移..."
        python3 quick_migrate.py
        ;;
    2)
        echo
        echo "检查依赖包..."
        pip3 install -r requirements.txt
        echo
        echo "🚀 启动完整迁移..."
        python3 migrate_json_to_sql.py
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo
echo "迁移完成！"
