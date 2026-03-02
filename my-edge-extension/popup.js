let allImages = [];

document.getElementById('selectAll').addEventListener('click', toggleSelectAll);
document.getElementById('downloadSelected').addEventListener('click', downloadSelected);

// 初始化加载图片
async function initializeImages() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const images = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const images = document.querySelectorAll('img');
      return Array.from(images).map(img => ({
        src: img.src,
        alt: img.alt || '未命名图片',
        width: img.naturalWidth,
        height: img.naturalHeight
      }));
    }
  });

  allImages = images[0].result;
  updateImageList();
}

// 更新图片列表显示
function updateImageList() {
  const minWidth = parseInt(document.getElementById('minWidth').value) || 0;
  const minHeight = parseInt(document.getElementById('minHeight').value) || 0;
  
  const filteredImages = allImages.filter(img => 
    img.width >= minWidth && img.height >= minHeight
  );

  const listContainer = document.getElementById('imageList');
  listContainer.innerHTML = filteredImages.map((img, index) => `
    <div class="image-item">
      <div class="checkbox-wrapper">
        <input type="checkbox" id="img_${index}" data-index="${index}">
      </div>
      <img src="${img.src}" class="thumbnail" alt="${img.alt}" 
           onerror="this.src='default-image.png'">
      <div class="image-info">
        <div>图片 ${index + 1}: ${img.alt}</div>
        <div>尺寸: ${img.width}x${img.height}</div>
        <div class="source-url">来源: ${img.src}</div>
      </div>
    </div>
  `).join('');
}

// 全选/取消全选
function toggleSelectAll() {
  const checkboxes = document.querySelectorAll('#imageList input[type="checkbox"]');
  const selectAllBtn = document.getElementById('selectAll');
  const isSelectAll = selectAllBtn.textContent === '全选';
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = isSelectAll;
  });
  
  selectAllBtn.textContent = isSelectAll ? '取消全选' : '全选';
}

// 下载选中的图片
async function downloadSelected() {
  const folderInput = document.getElementById('saveFolder');
  const basePath = folderInput.files?.[0]?.webkitRelativePath?.split('/')[0] || '';
  const basePathWithSlash = basePath ? `${basePath}/` : '';
  
  const checkboxes = document.querySelectorAll('#imageList input[type="checkbox"]:checked');
  
  for (let i = 0; i < checkboxes.length; i++) {
    const index = parseInt(checkboxes[i].dataset.index);
    const img = allImages[index];
    
    try {
      // 将图片转换为JPG格式
      const jpgUrl = await convertToJPG(img.src);
      
      await chrome.downloads.download({
        url: jpgUrl,
        filename: `${basePathWithSlash}image_${index + 1}_${img.width}x${img.height}_${img.alt.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`,
        saveAs: false
      });
    } catch (error) {
      console.error('下载失败:', error);
    }
  }
}

// 将图片转换为JPG格式
async function convertToJPG(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';  // 处理跨域问题
    
    img.onload = () => {
      // 创建canvas
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // 将图片绘制到canvas上
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';  // 设置白色背景
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // 将canvas转换为jpg格式的base64字符串
      try {
        const jpgUrl = canvas.toDataURL('image/jpeg', 0.9);  // 0.9是质量参数，范围0-1
        resolve(jpgUrl);
      } catch (e) {
        // 如果转换失败，返回原始URL
        resolve(imageUrl);
      }
    };
    
    img.onerror = () => {
      // 如果加载失败，返回原始URL
      resolve(imageUrl);
    };
    
    img.src = imageUrl;
  });
}

// 获取图片扩展名
function getImageExtension(url) {
  try {
    // 从URL中提取文件名
    const pathname = new URL(url).pathname;
    // 获取原始扩展名
    const originalExt = pathname.split('.').pop().toLowerCase();
    
    // 常见图片扩展名列表
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    
    // 如果是有效的图片扩展名，使用原始扩展名
    if (validExtensions.includes(originalExt)) {
      return `.${originalExt}`;
    }
    
    // 如果URL包含image/类型，根据MIME类型判断扩展名
    if (url.includes('image/')) {
      const mimeMatch = url.match(/image\/(\w+)/);
      if (mimeMatch && mimeMatch[1]) {
        const mimeExt = mimeMatch[1].toLowerCase();
        if (validExtensions.includes(mimeExt)) {
          return `.${mimeExt}`;
        }
      }
    }
    
    // 默认使用.jpg
    return '.jpg';
  } catch (e) {
    return '.jpg';
  }
}

// 监听筛选条件变化
document.getElementById('minWidth').addEventListener('input', updateImageList);
document.getElementById('minHeight').addEventListener('input', updateImageList);

// 添加拖拽相关事件处理
function initializeDragAndDrop() {
  const dropZone = document.getElementById('dropZone');

  // 阻止默认拖放行为
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // 处理拖拽状态的视觉反馈
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('dragover');
    });
  });

  // 处理拖放
  dropZone.addEventListener('drop', handleDrop);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function handleDrop(e) {
  const imageUrl = e.dataTransfer.getData('text/plain');
  if (!imageUrl) return;

  try {
    // 将图片转换为JPG格式
    const jpgUrl = await convertToJPG(imageUrl);
    
    // 从URL中提取文件名
    const fileName = `image_${Date.now()}_${getImageExtension(imageUrl)}`;
    
    // 下载图片
    await chrome.downloads.download({
      url: jpgUrl,
      filename: fileName,
      saveAs: false
    });
  } catch (error) {
    console.error('下载失败:', error);
  }
}

// 在初始化时添加拖拽功能
document.addEventListener('DOMContentLoaded', () => {
  initializeImages();
  initializeDragAndDrop();
});
