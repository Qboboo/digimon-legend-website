// digimon_legend_website/frontend/js/main.js

// 定义所有函数，确保在使用前已声明
// 渲染进化路线
function renderEvolutionPath(digimon) {
  if (!digimon.growth_path?.length) return '暂无进化路线数据';

  return `
    <div class="evolution-path-container">
      <div class="evolution-stages">
        ${digimon.growth_path.map((stage, index) => `
          <div class="evolution-stage">
            ${index > 0 ? `
              <div class="evolution-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"></path>
                </svg>
              </div>
            ` : ''}
            <div class="text-center">
              <img src="${stage.image}" 
                   alt="${stage.name}"
                   class="mx-auto">
              <div class="evolution-name mt-2" title="${stage.name}">
                <p class="font-medium text-gray-700 overflow-ellipsis overflow-hidden">${stage.name}</p>
              </div>
              <div class="evolution-requirements mt-3">
                ${stage.requirements ? `
                  <p class="text-xs text-gray-500 px-2 py-1 rounded whitespace-pre-wrap">${stage.requirements}</p>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 渲染所有数码兽到网格
function renderAllDigimons(grid, digimons) {
  const uniqueDigimons = digimons.filter(
    (digimon, index, self) => 
      index === self.findIndex(d => d.id === digimon.id)
  );
  
  if (uniqueDigimons.length === 0) {
    grid.innerHTML = '<p class="text-center col-span-full p-4">没有找到匹配的数码兽</p>';
    return;
  }
  
  grid.innerHTML = uniqueDigimons.map(d => renderDigimonCard(d)).join('');
}

// 工具函数 - 渲染数码兽卡片
function renderDigimonCard(digimon) {
  return `
    <div class="digimon-card cursor-pointer" data-Type="${digimon.Type || '未分类'}" onclick="showDigimonDetail(${digimon.id})">
      <div class="digimon-header">
        <img src="${digimon.image}" 
             alt="${digimon.name}" 
             class="digimon-image object-contain">
        <div class="flex-1">
          <h3 class="text-lg font-bold text-gray-800">${digimon.name}</h3>
          <div class="tags-container mt-2">
            ${digimon.Type ? `
            <span class="type-tag card-type-tag">
              ${digimon.Type}
            </span>
            ` : ''}
            <span class="stage-tag card-stage-tag">
              ${digimon.stage}
            </span>
            ${digimon.armor ? `
            <span class="type-tag card-armor-tag">
              ${digimon.armor}
            </span>
            ` : ''}
            ${digimon.egg ? `
            <span class="type-tag bg-green-100 text-green-800">
              ${digimon.egg}
            </span>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

// 渲染数码兽页面
function renderDigimonPage(container) {
  // 获取数码兽数据
  const digimonData = getDigimonData();
  
  // 设置HTML内容
  container.innerHTML = `
    <section class="bg-white bg-opacity-50 rounded-xl p-6 mb-8 pixel-border max-w-6xl mx-auto">
      <h2 class="text-2xl md:text-3xl text-center mb-6 text-blue-700">数码兽图鉴</h2>
      <div class="mb-6 flex justify-center">
        <div class="relative w-full md:w-1/2">
          <input type="text" id="digimon-search" placeholder="搜索数码兽..." class="w-full px-4 py-2 rounded-lg pixel-border focus:outline-none focus:ring-2 focus:ring-blue-500">
          <button id="search-btn" class="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-500 text-white px-3 py-1 rounded">
            🔍
          </button>
        </div>
      </div>
      
      <!-- 类型索引栏 -->
      <div class="mb-4">
        <h3 class="text-lg font-bold mb-2 text-center">按类型筛选</h3>
        <div id="type-filters" class="flex flex-wrap justify-center gap-2 mb-3">
          <!-- 类型筛选按钮将通过JavaScript动态加载 -->
        </div>
      </div>
      
      <!-- 数码兽卡片网格 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-2" id="digimon-grid">
        <!-- 数码兽卡片将通过JavaScript动态加载 -->
      </div>
      
      <!-- 分页控制 -->
      <div class="flex justify-center mt-4" id="pagination-controls">
        <button id="prev-page" class="px-4 py-2 bg-blue-100 text-blue-800 rounded-l-lg pixel-border disabled:opacity-50">上一页</button>
        <div id="page-indicator" class="px-4 py-2 bg-white text-blue-800">第 1 页</div>
        <button id="next-page" class="px-4 py-2 bg-blue-100 text-blue-800 rounded-r-lg pixel-border">下一页</button>
      </div>
    </section>
  `;
  
  // 分页变量
  let currentPage = 1;
  const itemsPerPage = 9;
  let filteredDigimons = [];
  
  // 初始化搜索功能
  const searchInput = document.getElementById('digimon-search');
  const searchBtn = document.getElementById('search-btn');
  
  // 获取类型筛选区域和数码兽网格
  const typeFilters = document.getElementById('type-filters');
  const digimonGrid = document.getElementById('digimon-grid');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const pageIndicator = document.getElementById('page-indicator');
  
  // 获取所有独特的类型并排序
  const uniqueTypes = new Set(digimonData.digimons.map(d => d.Type || '未分类').filter(Boolean));
  const types = Array.from(uniqueTypes).sort((a, b) => {
    // 定义类型顺序
    const typeOrder = {
      'SP': 1,
      'BA': 2,
      'AT': 3,
      'EX': 4,
      'X': 5
    };
    return (typeOrder[a] || 999) - (typeOrder[b] || 999);
  });
  
  // 清空类型筛选区域
  typeFilters.innerHTML = '';
  
  // 添加"全部"筛选按钮
  const allButton = document.createElement('div');
  allButton.className = 'type-filter active';
  allButton.setAttribute('data-type', 'all');
  allButton.textContent = '全部';
  typeFilters.appendChild(allButton);
  
  // 添加其他类型按钮
  types.forEach(type => {
    const button = document.createElement('div');
    button.className = 'type-filter';
    button.setAttribute('data-type', type);
    button.textContent = type;
    typeFilters.appendChild(button);
  });
  
  // 初始化过滤数组
  filteredDigimons = [...digimonData.digimons];
  
  // 渲染当前页的数码兽卡片
  function renderCurrentPage() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageItems = filteredDigimons.slice(startIndex, endIndex);
    
    if (digimonGrid) {
      digimonGrid.innerHTML = currentPageItems.map(digimon => 
        renderDigimonCard(digimon)
      ).join('');
    }
    
    // 更新页码指示器
    if (pageIndicator) {
      pageIndicator.textContent = `第 ${currentPage} 页，共 ${Math.ceil(filteredDigimons.length / itemsPerPage)} 页`;
    }
    
    // 更新按钮状态
    if (prevPageBtn) {
      prevPageBtn.disabled = currentPage === 1;
    }
    if (nextPageBtn) {
      nextPageBtn.disabled = currentPage >= Math.ceil(filteredDigimons.length / itemsPerPage);
    }
  }
  
  // 添加筛选功能
  const filterButtons = document.querySelectorAll('.type-filter');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 切换激活状态
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const selectedType = btn.getAttribute('data-type');
      
      // 筛选数码兽
      if (selectedType === 'all') {
        filteredDigimons = [...digimonData.digimons];
      } else {
        filteredDigimons = digimonData.digimons.filter(d => d.Type === selectedType);
      }
      
      // 重置到第一页并重新渲染
      currentPage = 1;
      renderCurrentPage();
    });
  });
  
  // 分页按钮事件
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderCurrentPage();
      window.scrollTo(0, 0);
    }
  });
  
  nextPageBtn.addEventListener('click', () => {
    if (currentPage < Math.ceil(filteredDigimons.length / itemsPerPage)) {
      currentPage++;
      renderCurrentPage();
      window.scrollTo(0, 0);
    }
  });
  
  // 渲染初始数码兽列表
  renderCurrentPage();
  
  function performSearch() {
    const searchTerm = searchInput.value.toLowerCase();
    
    filteredDigimons = digimonData.digimons.filter(d => 
      d.name.toLowerCase().includes(searchTerm)
    );
    
    currentPage = 1;
    renderCurrentPage();
  }
  
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
}

function closeModal() {
  const modal = document.getElementById('digimon-detail-modal');
  if (modal) {
    modal.remove();
  }
}

function showDigimonDetail(id) {
  // 先关闭任何已存在的模态框
  closeModal();

  const digimonData = getDigimonData();
  const digimon = digimonData.digimons.find(d => d.id === id);
  if (!digimon) return;

  const modal = document.createElement('div');
  modal.id = 'digimon-detail-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content pixel-border">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 class="text-3xl font-bold mb-3 text-blue-700">${digimon.name}</h2>
          <img src="${digimon.image}" alt="${digimon.name}" class="w-full h-auto rounded-lg mb-4 pixel-border bg-white p-2">
          <div class="grid grid-cols-2 gap-4 text-center">
            <div class="info-field">
              <h5>类型</h5>
              <p>${digimon.Type || '未知'}</p>
            </div>
            <div class="info-field">
              <h5>阶段</h5>
              <p>${digimon.stage || '未知'}</p>
            </div>
            <div class="info-field">
              <h5>属性</h5>
              <p>${digimon.armor || '未知'}</p>
            </div>
            <div class="info-field">
              <h5>数码蛋</h5>
              <p>${digimon.egg || '未知'}</p>
            </div>
          </div>
        </div>
        <div>
          <h3 class="text-2xl font-bold mb-3 text-blue-600">技能</h3>
          <div class="skill-box space-y-4">
            ${digimon.skills && digimon.skills.length > 0 ? digimon.skills.map(skill => `
              <div class="skill-item">
                <h4 class="font-bold text-lg text-blue-800">${skill.name}</h4>
                <p class="text-sm">${skill.description}</p>
              </div>
            `).join('') : '<p>暂无技能数据</p>'}
          </div>
          <h3 class="text-2xl font-bold mt-6 mb-3 text-blue-600">进化路线</h3>
          ${renderEvolutionPath(digimon)}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

function renderGuidePage(container) {
  container.innerHTML = `
    <section class="bg-white bg-opacity-80 rounded-xl p-6 mb-8 pixel-border">
      <h2 class="text-2xl md:text-3xl text-center mb-6 text-blue-700">地图攻略</h2>
      <div id="guides-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- 攻略卡片将通过JS动态加载 -->
      </div>
    </section>
  `;

  const guidesContainer = document.getElementById('guides-container');
  const allGuides = getDigimonData();

  if (!allGuides.guides || allGuides.guides.length === 0) {
    guidesContainer.innerHTML = '<p>暂无攻略</p>';
    return;
  }

  allGuides.guides.forEach(guide => {
    const card = document.createElement('a');
    card.href = `guide-detail.html?id=${guide.id}`;
    card.className = 'guide-card block bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:-translate-y-1';
    card.innerHTML = `
      <h3 class="text-xl font-bold mb-2 text-blue-800">${guide.title}</h3>
      <p class="text-gray-600 text-sm">${guide.summary}</p>
      <div class="text-xs text-gray-400 mt-3">更新于: ${guide.update_date}</div>
    `;
    guidesContainer.appendChild(card);
  });
}

// 正确的装备页面渲染函数
function renderEquipmentPage() {
    const container = document.getElementById('equipment-accordion-container');
    const paginationControls = document.getElementById('equipment-pagination-controls');
    const searchInput = document.getElementById('equipment-search');

    if (!container) {
        console.error("Equipment container not found!");
      return;
    }

    const equipmentData = getEquipmentData();
    let allDungeons = equipmentData || [];
    let currentPage = 1;
    const dungeonsPerPage = 5;

    function createItemElement(item) {
        const itemEl = document.createElement('div');
        itemEl.className = 'equipment-item';

        const imgContainer = document.createElement('div');
        imgContainer.className = 'flex-shrink-0';
        const img = document.createElement('img');
        const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIGZpbGw9IiNFNUU3RUIiLz48L3N2Zz4=';
        img.src = item.icon || item.image || placeholderImage;
        img.alt = item.name;
        img.className = 'h-12 w-12 object-contain rounded';
        imgContainer.appendChild(img);

        const detailsContainer = document.createElement('div');
        detailsContainer.className = 'flex-grow';

        const nameEl = document.createElement('p');
        nameEl.className = 'font-semibold flex items-center gap-2';
        
        const recipe = getSynthesisRecipeById(item.id);
        let synthesisButton = '';
        if (recipe) {
            synthesisButton = `
                <button 
                    class="text-xs bg-yellow-100 text-yellow-500 hover:bg-yellow-200 font-bold py-1 px-2 rounded-full"
                    onclick="showSynthesisTree('${item.id}'); event.stopPropagation();">
                    合成详情
                </button>
            `;
        }
        
        nameEl.innerHTML = `${item.name} <span class="text-sm font-normal text-gray-500">[${item.type || item.category}]</span> ${synthesisButton}`;
        detailsContainer.appendChild(nameEl);

        if (item.attributes) {
            const attributesEl = document.createElement('p');
            attributesEl.className = 'text-sm text-blue-600';
            attributesEl.innerHTML = item.attributes;
            detailsContainer.appendChild(attributesEl);
        }

        if (item.acquisitionMethod) {
            const acquisitionEl = document.createElement('p');
            acquisitionEl.className = 'item-acquisition';
            acquisitionEl.innerHTML = `<strong>获取方式:</strong><br>${item.acquisitionMethod}`;
            detailsContainer.appendChild(acquisitionEl);
        }
        
        itemEl.appendChild(imgContainer);
        itemEl.appendChild(detailsContainer);
        
        return itemEl;
    }


    function renderPage(pageNumber) {
        currentPage = pageNumber;
        container.innerHTML = '';
        const filteredDungeons = allDungeons.filter(dungeon => {
            const searchTerm = searchInput.value.toLowerCase();
            if (!searchTerm) return true;
            const matchName = dungeon.dungeonName.toLowerCase().includes(searchTerm);
            const matchSets = dungeon.equipmentSets.some(set => set.setName.toLowerCase().includes(searchTerm));
            const matchItems = [...(dungeon.equipmentSets.flatMap(s => s.items)), ...dungeon.looseItems].some(item => item.name.toLowerCase().includes(searchTerm));
            return matchName || matchSets || matchItems;
        });

        const startIndex = (currentPage - 1) * dungeonsPerPage;
        const endIndex = startIndex + dungeonsPerPage;
        const dungeonsToRender = filteredDungeons.slice(startIndex, endIndex);

        if (dungeonsToRender.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">未找到相关副本或装备。</p>';
        } else {
            dungeonsToRender.forEach(dungeon => {
                const dungeonContainer = document.createElement('div');
                dungeonContainer.className = 'dungeon-container';

                const banner = document.createElement('div');
                banner.className = 'dungeon-banner';
                banner.innerHTML = `
                    <img src="${dungeon.dungeonImage || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIGZpbGw9IiNFNUU3RUIiLz48L3N2Zz4='}" alt="${dungeon.dungeonName}" class="rounded">
                    <h3 class="font-bold text-xl text-gray-700">${dungeon.dungeonName}</h3>
                    <span class="arrow-icon ml-auto">▼</span>
                `;
                dungeonContainer.appendChild(banner);

                const setsOuterContainer = document.createElement('div');
                setsOuterContainer.className = 'dungeon-sets-container';
                
                const setsInnerContainer = document.createElement('div');
                // Initially collapsed, 'open' class will expand it.
                
                // Render equipment sets
                if (dungeon.equipmentSets && dungeon.equipmentSets.length > 0) {
                    dungeon.equipmentSets.forEach(set => {
                        const setBanner = document.createElement('div');
                        setBanner.className = 'set-banner';
                        setBanner.innerHTML = `
                            <h4 class="font-semibold text-lg text-blue-800">${set.setName}</h4>
                            <span class="arrow-icon ml-auto text-sm">▼</span>
                        `;
                        setsInnerContainer.appendChild(setBanner);

                        const setItemsOuterContainer = document.createElement('div');
                        setItemsOuterContainer.className = 'set-items-container';
                        
                        const setItemsInnerContainer = document.createElement('div');

                        const itemsAndBonusWrapper = document.createElement('div');
                        itemsAndBonusWrapper.className = 'set-items-container-inner';

                        set.items.forEach(item => {
                            itemsAndBonusWrapper.appendChild(createItemElement(item));
                        });

                        if (set.setBonus && set.setBonus.length > 0) {
                            const bonusContainer = document.createElement('div');
                            bonusContainer.className = 'set-bonus';
                            bonusContainer.innerHTML += `<h5>套装效果</h5>`;
                            set.setBonus.forEach(bonus => {
                                bonusContainer.innerHTML += `<p><strong>${bonus.count}件套:</strong> ${bonus.description}</p>`;
                            });
                            itemsAndBonusWrapper.appendChild(bonusContainer);
                        }
                        
                        setItemsInnerContainer.appendChild(itemsAndBonusWrapper);
                        setItemsOuterContainer.appendChild(setItemsInnerContainer);
                        setsInnerContainer.appendChild(setItemsOuterContainer);
                    });
                }

                // Render loose items
                if (dungeon.looseItems && dungeon.looseItems.length > 0) {
                    const looseItemsContainer = document.createElement('div');
                    looseItemsContainer.className = 'non-set-container';
                    dungeon.looseItems.forEach(item => {
                        looseItemsContainer.appendChild(createItemElement(item));
                    });
                    setsInnerContainer.appendChild(looseItemsContainer);
                }

                setsOuterContainer.appendChild(setsInnerContainer);
                dungeonContainer.appendChild(setsOuterContainer);
                container.appendChild(dungeonContainer);
            });
        }
        
        attachAccordionListeners();
        updatePagination(filteredDungeons.length);
    }

    function attachAccordionListeners() {
        document.querySelectorAll('.dungeon-banner').forEach(banner => {
            banner.addEventListener('click', () => {
                const setsContainer = banner.nextElementSibling;
                const arrow = banner.querySelector('.arrow-icon');
                
                setsContainer.classList.toggle('open');
                arrow.classList.toggle('open');
                
                if (setsContainer.classList.contains('open')) {
                    // Smooth scroll into view
                    setTimeout(() => {
                        banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 500); // Wait for animation to start
                }
            });
        });

        document.querySelectorAll('.set-banner').forEach(banner => {
            banner.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent dungeon from collapsing
                const itemsContainer = banner.nextElementSibling;
                const arrow = banner.querySelector('.arrow-icon');
                
                itemsContainer.classList.toggle('open');
                arrow.classList.toggle('open');
            });
        });
    }

    function updatePagination(totalDungeons) {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(totalDungeons / dungeonsPerPage);

        if (totalPages <= 1) {
            paginationControls.style.display = 'none';
            return;
        }
        paginationControls.style.display = 'flex';

        const createButton = (text, page, isDisabled = false, isActive = false) => {
            const button = document.createElement('button');
            button.innerHTML = text;
            button.disabled = isDisabled;
            button.dataset.page = page;
            button.className = `px-3 py-1 rounded-lg pixel-border transition-colors duration-200`;
            
            if (isActive) {
                button.classList.add('bg-blue-500', 'text-white', 'border-blue-700');
            } else {
                button.classList.add('bg-white', 'hover:bg-blue-100', 'disabled:opacity-50', 'disabled:cursor-not-allowed');
            }
            if(isDisabled) {
                button.classList.add('opacity-50', 'cursor-not-allowed');
            }
            return button;
        };

        const addEllipsis = () => {
            const span = document.createElement('span');
            span.textContent = '...';
            span.className = 'px-2 py-1 text-gray-500';
            paginationControls.appendChild(span);
        };

        // Prev button
        paginationControls.appendChild(createButton('&lt;', currentPage - 1, currentPage === 1));

        // Page numbers
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) {
                paginationControls.appendChild(createButton(i, i, false, i === currentPage));
            }
        } else {
            paginationControls.appendChild(createButton(1, 1, false, currentPage === 1));
            if (currentPage > 3) addEllipsis();
            
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            if (currentPage <= 3) {
                start = 2;
                end = 4;
            }
            if (currentPage >= totalPages - 2) {
                start = totalPages - 3;
                end = totalPages - 1;
            }

            for (let i = start; i <= end; i++) {
                paginationControls.appendChild(createButton(i, i, false, i === currentPage));
            }

            if (currentPage < totalPages - 2) addEllipsis();
            paginationControls.appendChild(createButton(totalPages, totalPages, false, currentPage === totalPages));
        }

        // Next button
        paginationControls.appendChild(createButton('&gt;', currentPage + 1, currentPage === totalPages));

        // Add event listeners for the newly created buttons
        paginationControls.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                const target = e.currentTarget;
                if (!target || target.disabled) return;
                
                const page = parseInt(target.dataset.page, 10);
                if (page && page !== currentPage) {
                    renderPage(page);
                }
            });
        });
    }
    
    // Initial render
    renderPage(1);

    // Search functionality
    searchInput.addEventListener('input', () => renderPage(1));
}

// 渲染主页
function renderHomePage(container) {
  container.innerHTML = `
    <section class="text-center mb-10 bg-white bg-opacity-60 p-8 rounded-xl pixel-border">
      <h2 class="text-4xl font-bold mb-4 text-blue-800">欢迎来到数码兽传说图鉴站</h2>
      <p class="text-lg text-gray-700 max-w-2xl mx-auto">
        在这里，你可以找到关于游戏中所有数码兽、装备、地图和攻略的详细信息。
      </p>
    </section>

    <section class="grid md:grid-cols-2 gap-8">
      <div class="bg-white bg-opacity-60 p-6 rounded-lg pixel-border">
        <h3 class="text-2xl font-bold mb-4 text-blue-700">最新更新</h3>
        <ul class="space-y-2">
          <li><a href="changelog.html" class="text-blue-600 hover:underline">修复装备图鉴无法点击的问题</a></li>
          <li><a href="digimon.html" class="text-blue-600 hover:underline">新增 "启示录兽" 进化路线</a></li>
        </ul>
      </div>
      <div class="bg-white bg-opacity-60 p-6 rounded-lg pixel-border">
        <h3 class="text-2xl font-bold mb-4 text-blue-700">快速导航</h3>
        <div class="grid grid-cols-2 gap-4">
          <a href="digimon.html" class="bg-blue-100 text-blue-800 p-4 text-center rounded-lg hover:bg-blue-200 transition-colors">数码兽图鉴</a>
          <a href="equipment.html" class="bg-green-100 text-green-800 p-4 text-center rounded-lg hover:bg-green-200 transition-colors">装备图鉴</a>
          <a href="guide.html" class="bg-yellow-100 text-yellow-800 p-4 text-center rounded-lg hover:bg-yellow-200 transition-colors">地图攻略</a>
          <a href="changelog.html" class="bg-purple-100 text-purple-800 p-4 text-center rounded-lg hover:bg-purple-200 transition-colors">更新日志</a>
        </div>
      </div>
    </section>
  `;
}

// 注意: equipment.html 有自己的加载逻辑，所以不在通用路由里处理
document.addEventListener('dataLoaded', () => {
  const page = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
  const mainContent = document.querySelector('main');

  if (!mainContent) return;

  // 这是一个简单的路由
  switch (page) {
    case 'equipment':
      // This page handles its own data fetching, but we can trigger it here
      // to maintain a single entry point.
      renderEquipmentPage();
      break;
    case 'digimon':
      renderDigimonPage(mainContent);
      break;
    case 'guide':
      renderGuidePage(mainContent);
      break;
    case 'changelog':
      // The changelog.html page now has its own data loading and rendering logic.
      // We assume it also listens to `dataLoaded` if needed.
      break;
    case 'index':
      renderHomePage(mainContent);
      break;
    case 'item-guide':
      renderItemGuidePage();
      break;
  }
});

// 全局暴露部分函数，以便HTML中的内联事件可以调用
window.showDigimonDetail = showDigimonDetail;
window.closeModal = closeModal;

// --- NEW: Synthesis Tree Modal Functions ---

/**
 * Creates and shows a modal with the synthesis tree for a given item ID.
 * @param {string} itemId - The ID of the item to display the synthesis tree for.
 */
function showSynthesisTree(itemId) {
    const rootItem = getItemById(itemId);
    if (!rootItem) {
        console.error(`Item with ID ${itemId} not found.`);
        return;
    }

    // Close any existing modal first
    const existingModal = document.getElementById('synthesis-tree-modal');
    if (existingModal) existingModal.remove();

    // Create modal elements
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'synthesis-tree-modal';
    modalOverlay.className = 'synthesis-modal-overlay';
    
    modalOverlay.innerHTML = `
        <div class="synthesis-modal-content">
            <button class="synthesis-modal-close">&times;</button>
            <h2 class="text-2xl font-bold mb-4 text-center">合成路线: ${rootItem.name}</h2>
            <div class="synthesis-tree">
                <ul>
                    <!-- Tree will be rendered here -->
                </ul>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // Render the tree starting from the root item
    const treeContainer = modalOverlay.querySelector('.synthesis-tree ul');
    renderSynthesisTreeNode(treeContainer, itemId, 1, true); // Pass true for isRoot

    // Add close functionality
    modalOverlay.querySelector('.synthesis-modal-close').onclick = () => modalOverlay.remove();
    modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) {
            modalOverlay.remove();
        }
    });
}

/**
 * Recursively renders a node in the synthesis tree.
 * @param {HTMLElement} parentContainer - The container to append the new node to.
 * @param {string} itemId - The ID of the item for the current node.
 * @param {number} quantity - The quantity of the item needed.
 * @param {boolean} isRoot - Flag to indicate if this is the root node.
 */
function renderSynthesisTreeNode(parentContainer, itemId, quantity, isRoot = false) {
    const item = getItemById(itemId);
    if (!item) return;

    const li = document.createElement('li');
    
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'tree-node';
    
    const recipe = getSynthesisRecipeById(itemId);
    const hasRecipe = recipe && recipe.length > 0;

    const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIGZpbGw9IiNFNUU3RUIiLz48L3N2Zz4=';
    const imageUrl = item.icon || item.image || placeholderImage;

    // Build the node's inner HTML
    let nodeHTML = `
        <img src="${imageUrl}" alt="${item.name}">
        <div class="node-name">${item.name} &times; ${quantity}</div>
    `;
    if (!hasRecipe && item.acquisitionMethod) {
        nodeHTML += `<div class="node-acquisition">(${item.acquisitionMethod})</div>`;
    } else {
        // Add a placeholder to ensure consistent height
        nodeHTML += `<div class="node-acquisition-placeholder">&nbsp;</div>`;
    }
    
    nodeDiv.innerHTML = nodeHTML;
    
    if (hasRecipe) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-btn';
        expandBtn.textContent = '+';
        nodeDiv.appendChild(expandBtn);

        const materialsList = document.createElement('ul');
        materialsList.style.display = 'none'; // Initially hidden
        
        li.appendChild(nodeDiv);
        li.appendChild(materialsList);

        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = materialsList.style.display !== 'none';
            materialsList.style.display = isExpanded ? 'none' : 'block';
            expandBtn.textContent = isExpanded ? '−' : '+';

            // First-time expansion: render children
            if (!isExpanded && materialsList.children.length === 0) {
                recipe.forEach(material => {
                    renderSynthesisTreeNode(materialsList, material.materialId, material.quantity);
                });
            }
        });

        // Auto-expand the root node
        if (isRoot) {
            expandBtn.click();
        }
    } else {
        li.appendChild(nodeDiv);
    }
    
    parentContainer.appendChild(li);
}

/**
 * Renders the item guide page: categories, search, and item grid.
 */
function renderItemGuidePage() {
    const allItems = getItemsData();
    const excludedCategories = ['礼盒'];
    const items = allItems.filter(item => !excludedCategories.includes(item.category));

    const grid = document.getElementById('item-grid');
    const searchInput = document.getElementById('item-search');
    const categoryFiltersContainer = document.getElementById('category-filters');

    // Pagination elements
    const paginationControls = document.getElementById('item-pagination-controls');

    // Pagination state
    let currentPage = 1;
    const itemsPerPage = 20;
    let currentFilteredItems = [];

    if (!items || items.length === 0) {
        if(grid) grid.innerHTML = '<p class="col-span-full text-center text-gray-500">没有可显示的道具。</p>';
        if(categoryFiltersContainer) categoryFiltersContainer.innerHTML = '';
        return;
    }

    // 1. Create category filters
    const categoryMapping = { '数码核': '孵化相关' };
    const rawCategories = [...new Set(items.map(item => item.category))];
    const categories = ['全部', ...rawCategories];

    categoryFiltersContainer.innerHTML = categories.map(category => {
        const displayCategory = categoryMapping[category] || category;
        return `
        <button class="filter-btn px-4 py-1 rounded-full text-sm font-medium ${category === '全部' ? 'active' : ''}" data-category="${category}">
            ${displayCategory}
        </button>
        `;
    }).join('');

    // Renders a specific page of items
    function renderPaginatedItems() {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const itemsToShow = currentFilteredItems.slice(startIndex, endIndex);
        
        renderItems(itemsToShow);
        updatePaginationControls();
    }

    // Updates pagination controls UI
    function updatePaginationControls() {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(currentFilteredItems.length / itemsPerPage);

        if (totalPages <= 1) {
            paginationControls.style.display = 'none';
            return;
        }
        paginationControls.style.display = 'flex';

        const createButton = (text, page, isDisabled = false, isActive = false) => {
            const button = document.createElement('button');
            button.innerHTML = text;
            button.disabled = isDisabled;
            button.dataset.page = page;
            button.className = `px-3 py-1 rounded-lg pixel-border transition-colors duration-200`;
            
            if (isActive) {
                button.classList.add('bg-blue-500', 'text-white', 'border-blue-700');
            } else {
                button.classList.add('bg-white', 'hover:bg-blue-100', 'disabled:opacity-50', 'disabled:cursor-not-allowed');
            }
            if(isDisabled) {
                button.classList.add('opacity-50', 'cursor-not-allowed');
            }
            return button;
        };

        const addEllipsis = () => {
            const span = document.createElement('span');
            span.textContent = '...';
            span.className = 'px-2 py-1 text-gray-500';
            paginationControls.appendChild(span);
        };

        // Prev button
        paginationControls.appendChild(createButton('&lt;', currentPage - 1, currentPage === 1));

        // Page numbers
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) {
                paginationControls.appendChild(createButton(i, i, false, i === currentPage));
            }
        } else {
            paginationControls.appendChild(createButton(1, 1, false, currentPage === 1));
            if (currentPage > 3) addEllipsis();
            
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            if (currentPage <= 3) {
                start = 2;
                end = 4;
            }
            if (currentPage >= totalPages - 2) {
                start = totalPages - 3;
                end = totalPages - 1;
            }

            for (let i = start; i <= end; i++) {
                paginationControls.appendChild(createButton(i, i, false, i === currentPage));
            }

            if (currentPage < totalPages - 2) addEllipsis();
            paginationControls.appendChild(createButton(totalPages, totalPages, false, currentPage === totalPages));
        }

        // Next button
        paginationControls.appendChild(createButton('&gt;', currentPage + 1, currentPage === totalPages));

        // Add event listeners for the newly created buttons
        paginationControls.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                const target = e.currentTarget;
                if (!target || target.disabled) return;
                
                const page = parseInt(target.dataset.page, 10);
                if (page && page !== currentPage) {
                    renderPaginatedItems();
                }
            });
        });
    }
    
    // Main function to filter items and trigger rendering
    const filterAndSearch = () => {
        currentPage = 1;
        const searchTerm = searchInput.value.toLowerCase();
        const activeCategory = categoryFiltersContainer.querySelector('.filter-btn.active').dataset.category;

        currentFilteredItems = items.filter(item => {
            const matchesCategory = activeCategory === '全部' || item.category === activeCategory;
            const matchesSearch = item.name.toLowerCase().includes(searchTerm);
            return matchesCategory && matchesSearch;
        });

        renderPaginatedItems();
    };

    // 2. Add event listeners
    const filterButtons = categoryFiltersContainer.querySelectorAll('.filter-btn');

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            filterAndSearch();
        });
    });

    searchInput.addEventListener('input', filterAndSearch);

    paginationControls.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target || target.disabled) return;
        
        const page = parseInt(target.dataset.page, 10);
        if (page && page !== currentPage) {
            currentPage = page;
            renderPaginatedItems();
        }
    });
    
    // 3. Initial render
    filterAndSearch();
}

/**
 * Renders individual item cards into the grid.
 * @param {Array} items - The array of item objects to render.
 */
function renderItems(items) {
    const grid = document.getElementById('item-grid');
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-500">未找到符合条件的道具。</p>';
        return;
    }

    grid.innerHTML = items.map(item => `
        <div class="item-card cursor-pointer" data-item-id="${item.id}">
            <img src="${item.image}" alt="${item.name}" class="item-image">
            <h3 class="item-name">${item.name}</h3>
        </div>
    `).join('');

    // Add click listeners for modals
    grid.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => {
            showItemDetailModal(card.dataset.itemId);
        });
    });
}

/**
 * Creates and shows a modal with detailed item information.
 * @param {string} itemId - The ID of the item to display.
 */
function showItemDetailModal(itemId) {
    const items = getItemsData();
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Use a placeholder if the image URL is invalid or missing
    const imageUrl = item.image ? item.image : `https://via.placeholder.com/150/808080/FFFFFF?text=${encodeURIComponent(item.category)}`;

    // Create modal elements
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50';
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            document.body.removeChild(modalOverlay);
        }
    });

    const modalContent = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl pixel-border-thick relative animate-fade-in-up">
            <button class="absolute top-2 right-2 text-2xl font-bold text-gray-500 hover:text-gray-800">&times;</button>
            <div class="p-6 md:p-8 flex flex-col md:flex-row gap-6">
                <div class="md:w-1/3 flex-shrink-0">
                    <img src="${imageUrl}" alt="${item.name}" class="w-full h-auto rounded-md pixel-border">
                </div>
                <div class="md:w-2/3">
                    <h2 class="text-2xl md:text-3xl font-bold mb-4 text-blue-700">${item.name}</h2>
                    <p class="text-gray-700 mb-4">${item.description}</p>
                    <div class="border-t pt-4">
                        <h3 class="font-bold text-lg mb-2">获取方式:</h3>
                        <p class="text-gray-600 whitespace-pre-line">${item.acquisitionMethod || item.acquisition_method}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    modalOverlay.innerHTML = modalContent;
    document.body.appendChild(modalOverlay);

    // Add close functionality
    modalOverlay.querySelector('button').addEventListener('click', () => {
        document.body.removeChild(modalOverlay);
    });
}