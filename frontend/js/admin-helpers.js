// Helper functions for admin.html

const API_BASE_URL = 'http://localhost:3001';

async function apiFetch(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };
    const response = await fetch(`${API_BASE_URL}${url}`, { ...defaultOptions, ...options });
    if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.message || 'An unknown error occurred');
        error.response = response;
        throw error;
    }
    // Handle cases with no response body
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
    } 
    return;
}

// New unified asset upload handler
async function handleAssetUpload(event, targetInputId, isMulti = false, isEvolution = false) {
  const fileInput = event.target;
  const file = fileInput.files[0];
  if (!file) return;

  let targetInput;
  // For dynamic templates, find the input relative to the file input, otherwise get by ID
  if (targetInputId) {
    targetInput = document.getElementById(targetInputId);
  } else {
    targetInput = fileInput.previousElementSibling.previousElementSibling;
  }
  
  if (!targetInput) {
    console.error("Could not find the target input for the upload.");
    fileInput.value = '';
    return;
  }

  let folderPath = 'details_digimons';
  if (isEvolution) {
    const evolutionId = document.getElementById('evolution-id').value;
    if (!evolutionId) {
      alert('请先填写"路线ID"并保存一次，才能上传图片！');
      fileInput.value = ''; // Reset file input
      return;
    }
    folderPath = `guides/src/digimon/${evolutionId}`;
  }

  const formData = new FormData();
  formData.append('image', file);
  
  const uploadButton = targetInput.nextElementSibling;
  const originalButtonText = uploadButton.textContent;
  uploadButton.textContent = '上传中...';
  uploadButton.disabled = true;

  try {
    const response = await fetch(`/api/upload/digimon-asset?folderPath=${folderPath}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '上传失败，无法解析错误信息。' }));
      throw new Error(errorData.message || '上传失败');
    }

    const result = await response.json();

    if (isMulti) {
      const currentValue = targetInput.value.trim();
      targetInput.value = currentValue ? `${currentValue},${result.url}` : result.url;
    } else {
      targetInput.value = result.url;
    }
  } catch (error) {
    console.error('Upload failed:', error);
    alert(`上传失败: ${error.message}`);
  } finally {
    uploadButton.textContent = originalButtonText;
    uploadButton.disabled = false;
    fileInput.value = ''; // Reset file input to allow re-uploading the same file
  }
}

// This file contains helper functions for the admin panel,
// specifically for the "Item Guide" (综合图鉴) section.

let allItemsCache = [];

/**
 * Loads the main panel for the Item Guide, fetching data and setting up the UI.
 */
async function loadItemGuidePanel() {
    const panel = document.getElementById('panel-item-guide');
    if (!panel) {
        console.error('Error: Item guide panel (#panel-item-guide) not found!');
        return;
    }

    // Set a flag to prevent reloading data unnecessarily
    panel.dataset.loaded = 'true';

    // Basic structure with a button to add new items
    panel.innerHTML = `
        <div class="p-4">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">综合图鉴管理</h2>
                <button id="add-new-item-btn" class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600">添加新道具</button>
            </div>
            <div id="item-list-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <p>加载中...</p>
            </div>
        </div>
    `;

    document.getElementById('add-new-item-btn').addEventListener('click', () => openItemEditor(null));

    try {
        allItemsCache = await apiFetch('/items');
        renderItems(allItemsCache);
    } catch (error) {
        console.error('Failed to load items:', error);
        document.getElementById('item-list-container').innerHTML = '<p class="text-red-500">无法加载道具列表。</p>';
    }
}

/**
 * Renders the list of items into the container.
 * @param {Array} items - The array of item objects to render.
 */
function renderItems(items) {
    const container = document.getElementById('item-list-container');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="col-span-full">还没有任何道具。</p>';
        return;
    }

    // Sort items by category, then by name
    items.sort((a, b) => {
        if (a.category < b.category) return -1;
        if (a.category > b.category) return 1;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = items.map(item => `
        <div class="bg-white p-4 rounded-lg shadow-md flex flex-col gap-3 transition-shadow hover:shadow-lg" data-item-id="${item.id}">
            <div class="flex items-start gap-4">
                <img src="${item.image || 'https://via.placeholder.com/100'}" alt="${item.name}" class="w-20 h-20 object-contain rounded flex-shrink-0 bg-gray-100 p-1">
                <div class="flex-grow">
                    <h3 class="font-bold text-lg text-gray-800">${item.name}</h3>
                    <p class="text-sm text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 inline-block">${item.category}</p>
                </div>
            </div>
            <p class="text-sm text-gray-600 flex-grow min-h-[40px]">${item.description || '没有描述。'}</p>
            <p class="text-xs text-gray-500 mt-1"><strong>获取方式:</strong> ${item.acquisition || 'N/A'}</p>
            <div class="flex-shrink-0 flex gap-2 mt-2 self-end border-t w-full pt-3">
                <button onclick="openItemEditor('${item.id}')" class="bg-yellow-400 text-white px-3 py-1 rounded text-sm hover:bg-yellow-500 w-full">编辑</button>
                <button onclick="deleteItem('${item.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 w-full">删除</button>
            </div>
        </div>
    `).join('');
}

/**
 * Opens the modal to edit or create an item.
 * @param {string|null} itemId - The ID of the item to edit, or null to create a new one.
 */
function openItemEditor(itemId) {
    const modal = document.getElementById('item-editor-modal');
    const form = document.getElementById('item-editor-form');
    const title = document.getElementById('item-modal-title');
    const imagePreview = document.getElementById('item-image-preview');

    form.reset();
    
    if (itemId) {
        const item = allItemsCache.find(i => i.id === itemId);
        if (!item) {
            alert('错误：找不到该道具！');
            return;
        }
        title.textContent = '编辑道具';
        document.getElementById('item-id').value = item.id;
        document.getElementById('item-name').value = item.name;
        document.getElementById('item-category').value = item.category;
        document.getElementById('item-image-url').value = item.image || '';
        imagePreview.src = item.image || 'https://via.placeholder.com/100';
        document.getElementById('item-description').value = item.description || '';
        document.getElementById('item-acquisition').value = item.acquisition || '';
    } else {
        title.textContent = '添加新道具';
        document.getElementById('item-id').value = '';
        imagePreview.src = 'https://via.placeholder.com/100';
    }

    modal.classList.remove('hidden');
}

/**
 * Closes the item editor modal.
 */
function closeItemEditor() {
    const modal = document.getElementById('item-editor-modal');
    modal.classList.add('hidden');
}

/**
 * Handles the file upload for an item's image.
 * @param {Event} event - The file input change event.
 */
async function handleItemImageUpload(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;

    // Use a generic folder for all items for simplicity
    const folderPath = 'guides/src/items';
    
    const formData = new FormData();
    formData.append('image', file);

    const uploadButton = document.querySelector('label[for="item-image-upload"]');
    uploadButton.textContent = '上传中...';
    uploadButton.disabled = true;

    try {
        const result = await fetch(`${API_BASE_URL}/upload/digimon-asset?folderPath=${folderPath}`, {
            method: 'POST',
            body: formData,
        }).then(res => {
            if (!res.ok) throw new Error('服务器错误');
            return res.json();
        });

        if (result.url) {
            document.getElementById('item-image-url').value = result.url;
            document.getElementById('item-image-preview').src = result.url;
        } else {
            throw new Error(result.message || '图片上传失败');
        }
    } catch (error) {
        alert(`图片上传失败: ${error.message}`);
    } finally {
        uploadButton.textContent = '更换图片';
        uploadButton.disabled = false;
        input.value = ''; // Clear the file input
    }
}


/**
 * Saves the item data (create or update) to the server.
 */
async function saveItem() {
    const id = document.getElementById('item-id').value;
    const name = document.getElementById('item-name').value;
    const category = document.getElementById('item-category').value;
    const image = document.getElementById('item-image-url').value;
    const description = document.getElementById('item-description').value;
    const acquisition = document.getElementById('item-acquisition').value;
    
    if (!name) {
        alert('道具名称不能为空。');
        return;
    }

    const itemData = { name, category, image, description, acquisition };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/items/${id}` : '/items';
    if(id) itemData.id = id;

    try {
        await apiFetch(url, {
            method: method,
            body: JSON.stringify(itemData),
        });
        closeItemEditor();
        await loadItemGuidePanel(); // Reload the list
        alert('道具保存成功！');
    } catch (error) {
        console.error('Failed to save item:', error);
        alert(`保存失败: ${error.message}`);
    }
}

/**
 * Deletes an item from the server.
 * @param {string} itemId - The ID of the item to delete.
 */
async function deleteItem(itemId) {
    if (!confirm('确定要删除这个道具吗？此操作不可撤销。')) {
        return;
    }

    try {
        await apiFetch(`/items/${itemId}`, { method: 'DELETE' });
        await loadItemGuidePanel(); // Reload the list
        alert('道具删除成功！');
    } catch (error) {
        console.error('Failed to delete item:', error);
        alert(`删除失败: ${error.message}`);
    }
}

// Attach listeners once the DOM is loaded.
document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-item-button');
    if (saveButton) {
        saveButton.addEventListener('click', saveItem);
    }
    
    const imageUploadInput = document.getElementById('item-image-upload');
    if(imageUploadInput) {
        // We link the button click to the hidden input click.
        const uploadButton = document.querySelector('label[for="item-image-upload"]');
        if(uploadButton) {
            uploadButton.onclick = (e) => {
                e.preventDefault(); // Prevent label's default behavior
                imageUploadInput.click();
            };
        }
        imageUploadInput.addEventListener('change', handleItemImageUpload);
    }

    const cancelItemModalBtn = document.getElementById('cancel-item-modal-btn');
    if (cancelItemModalBtn) {
        cancelItemModalBtn.addEventListener('click', closeItemEditor);
    }
}); 