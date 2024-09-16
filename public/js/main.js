// public/js/main.js

// 主题切换功能
const initTheme = () => {
  const themeToggle = document.getElementById('themeToggle');
  const htmlElement = document.documentElement;

  const updateTheme = () => {
    localStorage.theme = htmlElement.classList.contains('dark') ? 'dark' : 'light';
  };

  themeToggle.addEventListener('click', () => {
    htmlElement.classList.toggle('dark');
    updateTheme();
  });

  // 初始化主题
  if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    htmlElement.classList.add('dark');
  } else {
    htmlElement.classList.remove('dark');
  }
  updateTheme();
};

// 文件上传和处理功能
const initFileUpload = () => {
  const form = document.getElementById('uploadForm');
  const resultDiv = document.getElementById('result');
  const downloadLink = document.getElementById('downloadLink');
  const compressionLevel = document.getElementById('compressionLevel');
  const compressionLevelValue = document.getElementById('compressionLevelValue');
  const fileInput = document.getElementById('glbFile');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressPercentage = document.getElementById('progressPercentage');
  const dropZone = document.querySelector('label[for="glbFile"]');

  compressionLevel.addEventListener('input', function() {
    compressionLevelValue.textContent = this.value;
  });

  const updateProgress = (percent) => {
    progressBar.style.width = `${percent}%`;
    progressPercentage.textContent = `${percent}%`;
  };

  const checkFileSize = (file) => {
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      alert('文件大小超过200MB限制，请选择更小的文件。');
      return false;
    }
    return true;
  };

  const updateFileInfo = (file) => {
    const fileInfo = document.getElementById('fileInfo');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileType = document.getElementById('fileType');

    if (file) {
      fileName.textContent = `文件名：${escapeHtml(file.name)}`;
      fileSize.textContent = `文件大小：${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      fileType.textContent = `文件类型：${escapeHtml(file.type || 'GLB文件')}`;

      uploadPrompt.classList.add('hidden');
      fileInfo.classList.remove('hidden');
    } else {
      uploadPrompt.classList.remove('hidden');
      fileInfo.classList.add('hidden');
    }
  };

  // 添加一个用于转义 HTML 的函数
  const escapeHtml = (unsafe) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const handleFileSelect = (file) => {
    if (file.name.toLowerCase().endsWith('.glb')) {
      if (checkFileSize(file)) {
        updateFileInfo(file);
      } else {
        fileInput.value = ''; // 清除文件选择
        updateFileInfo(null);
      }
    } else {
      alert('不支持该文件格式。请上传 GLB 文件。');
      fileInput.value = ''; // 清除文件选择
      updateFileInfo(null);
    }
  };

  fileInput.addEventListener('change', function() {
    if (this.files && this.files[0]) {
      handleFileSelect(this.files[0]);
    }
  });

  const preventDefaults = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const highlight = () => {
    dropZone.classList.add('bg-blue-100');
  };

  const unhighlight = () => {
    dropZone.classList.remove('bg-blue-100');
  };

  const handleDrop = (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files && files[0]) {
      fileInput.files = files;
      handleFileSelect(files[0]);
    }
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });

  dropZone.addEventListener('drop', handleDrop, false);

  // 清除文件按钮
  const clearFileButton = document.createElement('button');
  clearFileButton.textContent = '清除文件';
  clearFileButton.className = 'mt-2 text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300';
  clearFileButton.onclick = function(e) {
    e.preventDefault();
    fileInput.value = '';
    updateFileInfo(null);
  };
  document.getElementById('fileInfo').appendChild(clearFileButton);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    
    // 获取 CSRF 令牌
    const csrfResponse = await fetch('/csrf-token');
    const { csrfToken } = await csrfResponse.json();
    
    // 将 CSRF 令牌添加到表单数据
    formData.append('_csrf', csrfToken);
    
    // 显示进度条
    progressContainer.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    
    try {
      const response = await fetch('/compress', {
        method: 'POST',
        body: formData,
        headers: {
          'CSRF-Token': csrfToken
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let compressedFileName = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream complete');
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        console.log('Received chunk:', chunk);
        
        // 添加一个小的延迟来处理接收到的数据
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const events = chunk.split('\n\n');
        for (const event of events) {
          if (event.startsWith('data: ')) {
            try {
              const data = JSON.parse(event.slice(6));
              console.log('Parsed data:', data);
              if (data.error) {
                throw new Error(data.error);
              } else if (data.progress !== undefined) {
                updateProgress(data.progress);
                console.log(`Step: ${escapeHtml(data.step)}, Progress: ${data.progress}%, Details: ${escapeHtml(data.details)}`);
                if (data.step === '完成' && data.details.endsWith('.glb')) {
                  compressedFileName = escapeHtml(data.details);
                }
                if (data.progress === 100) {
                  // 压缩完成，显示下载链接
                  if (compressedFileName) {
                    downloadLink.href = `/download/${encodeURIComponent(compressedFileName)}`;
                    downloadLink.download = compressedFileName;
                    progressContainer.classList.add('hidden');
                    resultDiv.classList.remove('hidden');
                  } else {
                    console.error('Compressed file name not received');
                  }
                }
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error);
            }
          } else if (event.startsWith('event: close')) {
            console.log('Received close event');
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert(escapeHtml(error.message) || '发生错误，请重试。');
      progressContainer.classList.add('hidden');
    }
  });
};

// 初始化函数
const init = () => {
  initTheme();
  initFileUpload();
};

// 当 DOM 加载完成后执行初始化
document.addEventListener('DOMContentLoaded', init);

// Service Worker 注册
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker 已注册:', registration);
      })
      .catch((error) => {
        console.log('Service Worker 注册失败:', error);
      });
  });
}