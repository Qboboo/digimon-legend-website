@echo off
chcp 65001 >nul
echo 🔥 数码兽传说网站 - 数据迁移工具
echo =====================================
echo.

echo 检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未找到Python，请先安装Python 3.7+
    pause
    exit /b 1
)

echo ✅ Python环境正常
echo.

echo 选择迁移方式:
echo 1. 快速迁移 (推荐，适合测试)
echo 2. 完整迁移 (功能完整，适合生产环境)
echo.

set /p choice="请输入选择 (1 或 2): "

if "%choice%"=="1" (
    echo.
    echo 🚀 启动快速迁移...
    python quick_migrate.py
) else if "%choice%"=="2" (
    echo.
    echo 检查依赖包...
    pip install -r requirements.txt
    echo.
    echo 🚀 启动完整迁移...
    python migrate_json_to_sql.py
) else (
    echo ❌ 无效选择
)

echo.
pause
