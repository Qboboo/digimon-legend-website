// digimon_legend_website/frontend/js/data.js

// API URL
const API_BASE_URL = 'http://localhost:3001/api';

// 初始化内存数据对象
let digimonData = { digimons: [] };
let changelogData = [];
let guidesData = {}; // 改为对象，用于存储不同类别的指南

// 从API加载指南数据
async function loadGuidesData() {
    try {
        const response = await fetch(`${API_BASE_URL}/guides`);
        if (!response.ok) {
            throw new Error('服务器响应错误');
        }
        const guides = await response.json();

        // 按分类重新组织数据
        guidesData = {
            gameplay: guides.filter(g => g.category === 'gameplay'),
            area: guides.filter(g => g.category === 'area'),
            boss: guides.filter(g => g.category === 'boss')
        };
        
        // 为了兼容旧的缓存逻辑，我们将所有指南存储到localStorage
        localStorage.setItem('guidesData', JSON.stringify(guides));
        
        return guides;
    } catch (error) {
        console.error('从API加载攻略失败:', error);
        console.log('尝试从缓存加载...');
        return getGuidesDataFromCache(true); // 传入参数以避免无限循环
    }
}


// 从本地存储获取指南数据
function getGuidesDataFromCache(isFallback = false) {
    const cachedData = localStorage.getItem('guidesData');
    if (cachedData) {
        const guides = JSON.parse(cachedData);
        // 重新组织数据结构
        guidesData = {
            gameplay: guides.filter(g => g.category === 'gameplay'),
            area: guides.filter(g => g.category === 'area'),
            boss: guides.filter(g => g.category === 'boss')
        };
        return guides;
    }
    // 如果是回退逻辑，并且缓存也没有，则返回空数组防止错误
    if (isFallback) {
        guidesData = { gameplay: [], area: [], boss: [] };
        return [];
    }
    return [];
}

// 获取所有指南数据
async function getAllGuides() {
    if (Object.keys(guidesData).length === 0 || !guidesData.gameplay || !guidesData.area || !guidesData.boss) {
        await loadGuidesData();
    }
    return [
        ...guidesData.gameplay,
        ...guidesData.area,
        ...guidesData.boss
    ];
}

// 获取特定类别的指南数据
async function getGuidesByCategory(category) {
    if (Object.keys(guidesData).length === 0 || !guidesData.gameplay || !guidesData.area || !guidesData.boss) {
        await loadGuidesData();
    }

    if (category === 'all') {
        return getAllGuides();
    }

    // 处理类别映射
    if (category === 'beginner') {
        return [...guidesData.gameplay];
    } else if (category === 'gameplay') {
        return [...guidesData.gameplay];
    }

    return guidesData[category] || [];
}

// 根据ID或Slug获取特定指南
async function getGuideById(id) {
    if (Object.keys(guidesData).length === 0 || !guidesData.gameplay || !guidesData.area || !guidesData.boss) {
        await loadGuidesData();
    }

    const allGuides = await getAllGuides();
    
    // 尝试将id解析为数字
    const parsedId = parseInt(id);

    // 如果id是数字，则按id查找，否则按slug查找
    if (!isNaN(parsedId)) {
        const guideById = allGuides.find(g => g.id === parsedId);
        if(guideById) return guideById;
    }
    
    // 如果按id找不到，或者id不是数字，则按slug查找
    return allGuides.find(g => g.slug === id) || null;
}

// 根据Slug获取特定指南
async function getGuideBySlug(slug) {
    if (Object.keys(guidesData).length === 0) {
        await loadGuidesData();
    }

    const allGuides = await getAllGuides();
    return allGuides.find(guide => guide.slug === slug) || null;
}

// 初始化数据
async function initData() {
    console.log('初始化数据...');
    try {
        // 总是尝试从API获取最新数据
        await loadGuidesData();
    } catch (error) {
        console.error('数据初始化失败:', error);
    }
    
    console.log('数据初始化完成！');
    // 触发数据加载完成事件
    document.dispatchEvent(new CustomEvent('dataLoaded'));
}

// 在页面加载时初始化数据
document.addEventListener('DOMContentLoaded', initData);

// 从API获取数码兽数据 (保留旧功能，以备将来使用)
async function fetchDigimonData() {
    try {
        console.log('尝试从API获取数码兽数据...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        const response = await fetch(`${API_BASE_URL}/digimons`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            console.log('成功获取数码兽数据');
            localStorage.setItem('digimonData', JSON.stringify(data));
            updateDigimonData(data);
            return data;
        } else {
            console.error(`获取数码兽数据失败: ${response.status} ${response.statusText}`);
            return getDigimonDataFromCache();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('获取数码兽数据超时，使用本地数据');
        } else {
            console.error('获取数码兽数据出错:', error);
        }
        return getDigimonDataFromCache();
    }
}

// 从本地存储获取数码兽数据
function getDigimonDataFromCache() {
    const cachedData = localStorage.getItem('digimonData');
    return cachedData ? JSON.parse(cachedData) : { digimons: [] };
}

// 从API获取更新日志数据 (保留旧功能)
async function fetchChangelogData() {
    try {
        console.log('尝试从API获取更新日志数据...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        const response = await fetch(`${API_BASE_URL}/changelog`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            console.log('成功获取更新日志数据');
            updateChangelogData(data);
            return data;
        } else {
            console.error(`获取更新日志数据失败: ${response.status} ${response.statusText}`);
            return getChangelogDataFromCache();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('获取更新日志数据超时，使用本地数据');
        } else {
            console.error('获取更新日志数据出错:', error);
        }
        return getChangelogDataFromCache();
    }
}

// 从本地存储获取更新日志数据
function getChangelogDataFromCache() {
    const cachedData = localStorage.getItem('changelogData');
    return cachedData ? JSON.parse(cachedData) : [];
}

// 将更新日志数据缓存到本地存储
function updateChangelogData(newData) {
    changelogData = newData;
    localStorage.setItem('changelogData', JSON.stringify(newData));
}

// 获取数码兽数据函数
function getDigimonData() {
    return digimonData;
}

// 更新数码兽数据函数
function updateDigimonData(newData) {
    digimonData = newData;
    localStorage.setItem('digimonData', JSON.stringify(newData));
}

// 获取更新日志数据函数
function getChangelogData() {
    return changelogData;
}

// 用于测试数据加载的函数
async function testDataLoading() {
    console.log('测试数据加载...');
    console.log('数码兽数据:', digimonData);
    console.log('更新日志数据:', changelogData);
    
    const allGuides = await getAllGuides();
    console.log('指南数据:', allGuides);
    
    if (allGuides.length > 0) {
        const gameplayGuides = await getGuidesByCategory('gameplay');
        console.log('游戏玩法指南:', gameplayGuides);
        
        const areasGuides = await getGuidesByCategory('area');
        console.log('区域指南:', areasGuides);
        
        const bossGuides = await getGuidesByCategory('boss');
        console.log('BOSS指南:', bossGuides);
        
        if (allGuides[0]) {
            const firstGuideIdentifier = allGuides[0].slug || allGuides[0].id;
            const guideById = await getGuideById(firstGuideIdentifier);
            console.log('通过ID/Slug获取指南:', guideById);
        }
    }
}

// 将所有函数加入全局对象
window.getDigimonData = getDigimonData;
window.updateDigimonData = updateDigimonData;
window.getChangelogData = getChangelogData;
window.updateChangelogData = updateChangelogData;
window.getAllGuides = getAllGuides;
window.getGuidesByCategory = getGuidesByCategory;
window.getGuideById = getGuideById;
window.getGuideBySlug = getGuideBySlug;
window.testDataLoading = testDataLoading;

// 数据加载完成后运行测试
document.addEventListener('dataLoaded', () => {
    console.log('数据加载完成事件触发');
    // 如果是开发环境，自动运行测试
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        testDataLoading();
    }
});

// 数码兽详情数据 (保留)
const digimonDetailsData = {
  "dukemon": {
    "name": "红莲骑士兽兽",
    "image": "https://digimon.net/cimages/digimon/dukemon.jpg",
    "positioning": "物理输出",
    "Type": "ba",
    "armor": "光",
    "fit": "60%",
    "egg": "R4",
    "time": "7天",
    "skills": [
      {
        "name": "Q - 骑士冲锋",
        "description": "冲向目标地点后，对途经敌人造成力量x25+防御x15点伤害后进入2s悬空状态。悬空：暂时停留在空中，某些技能的形态发生变化，但施法距离降低。"
      },
      {
        "name": "W - 圣盾「埃癸斯」",
        "description": "临时提高35%伤害减免和33%当前生命值的每秒回血，持续6s。以左手所持圣盾「埃癸斯」抵挡攻击。"
      },
      {
        "name": "R - 皇家枪击",
        "description": "对途经敌人造成(力量x80+智力x60)伤害。若处于悬空状态，改为对范围内敌人造成伤害后附加10%护甲扣除状态，持续10s并刷新骑士冲锋。用圣枪「格拉墨」打出强烈的一击。"
      },
      {
        "name": "D - 极乐净土",
        "description": "使用时清除负面状态，对途经敌人造成全属性x80伤害，若处于悬空状态，则取消前摇，改为只造成90%范围伤害并刷新骑士冲锋。用左臂的圣盾「埃癸斯」放出净化一切的光束。"
      }
    ]
  }
};

// 数码兽进化路径数据 (保留)
const digimonEvolutionPaths = {
  "guilmon": {
    "name": "基尔兽",
    "title": "基尔兽进化路线",
    "type": {
      "one": "AT",
      "two": "X-AI",
      "three":"SP"
    },
    "paths": [
      {
        // 第一进化路线
        "stages": [
          {
            "name": "基尔兽",
            "image": "https://digimon.net/cimages/digimon/guilmon.jpg",
            "requirement": ""
          },
          {
            "name": "古拉兽",
            "image": "https://digimon.net/cimages/digimon/growmon.jpg",
            "requirement": "契合达到20%"
          },
          {
            "name": "大古拉兽",
            "image": "https://digimon.net/cimages/digimon/megalogrowmon.jpg",
            "requirement": "契合达到40%"
          },
          {
            "name": "红莲骑士兽",
            "image": "https://digimon.net/cimages/digimon/dukemon.jpg",
            "requirement": "1.使用枪骑核<br>2.契合达到60%",
            "digimonId": "dukemon"
          },
          {
            "name": "真红莲骑士兽",
            "image": "https://digimon.net/cimages/digimon/dukemoncrimsonmode.jpg",
            "requirement": "契合达到75%后使用格拉尼"
          }
        ]
      },
      {
        // 第二进化路线
        "stages": [
          {
            "name": "",
            "image": "",
            "requirement": "",
            "hidden": true
          },
          {
            "name": "古拉兽",
            "image": "https://digimon.net/cimages/digimon/growmon.jpg",
            "requirement": "契合达到20%"
          },
          {
            "name": "大古拉兽",
            "image": "https://digimon.net/cimages/digimon/megalogrowmon.jpg",
            "requirement": "契合达到40%"
          },
          {
            "name": "中世纪公爵兽",
            "image": "https://digimon.net/cimages/digimon/medievaldukemon.jpg",
            "requirement": "契合达到60%"
          }
        ]
      }
    ],
    "connections": [
      {
        "type": "cross", 
        "from": {"pathIndex": 0, "stageIndex": 0}, 
        "to": {"pathIndex": 1, "stageIndex": 1},
        "lineType": "X-AI"
      },
      {
        "type": "line", 
        "pathIndex": 0,
        "lineType": "AT"
      },
      {
        "type": "line", 
        "pathIndex": 1,
        "lineType": "X-AI",
        "startIndex": 1
      }
    ]
  }
};

// 数码兽卡片数据 (保留)
const digimonCardsData = {
  guilmon: {
    name: "基尔兽",
    image: "https://digimon.net/cimages/digimon/guilmon.jpg",
    evolutionImages: [
      "https://digimon.net/cimages/digimon/guilmon.jpg",
      "https://digimon.net/cimages/digimon/dukemon.jpg",
      "https://digimon.net/cimages/digimon/medievaldukemon.jpg"
    ],
    evolutionNames: ["基尔兽", "公爵兽", "中世纪公爵兽"]
  }
};