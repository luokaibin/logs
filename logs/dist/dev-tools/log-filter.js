/**
 * 日志级别和关键字过滤系统
 * 支持设置日志级别和关键字过滤
 * 日志级别：trace < debug < info < warn < error < silent
 * 关键字过滤：输入关键字，日志如果是关键字开头则打印，否则不打印
 */

(function() {
  // 判断是否为开发环境
  const isDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // 日志级别常量
  const LOG_LEVELS = {
    TRACE: "trace",
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    SILENT: "silent",
  };

  // 本地存储键名
  const STORAGE_KEYS = {
    LOG_LEVEL: "loglevel",
    FILTER_KEYWORDS: "_logFilterKeyWords",
  };

  /**
   * 创建日志控制面板
   */
  function createLogFilterControl() {
    // 只在开发环境显示控制面板
    if (!isDev) {
      return;
    }

    // 创建控制按钮
    const button = document.createElement("button");
    button.textContent = "日志过滤";
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 100px;
      background: #28a745;
      color: white;
      border: none;
      border-radius: 5px;
      padding: 5px 10px;
      font-size: 12px;
      z-index: 9999;
      cursor: pointer;
    `;

    // 创建控制面板
    const panel = document.createElement("div");
    panel.style.cssText = `
      position: fixed;
      bottom: 60px;
      right: 100px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 5px;
      padding: 10px;
      z-index: 9999;
      width: 250px;
      display: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;

    // 创建标题
    const title = document.createElement("h3");
    title.textContent = "日志过滤设置";
    title.style.margin = "0 0 10px 0";
    title.style.fontSize = "14px";
    panel.appendChild(title);

    // 创建日志级别选择器
    const levelTitle = document.createElement("p");
    levelTitle.textContent = "日志级别:";
    levelTitle.style.margin = "10px 0 5px 0";
    levelTitle.style.fontWeight = "bold";
    levelTitle.style.fontSize = "13px";
    panel.appendChild(levelTitle);

    const levels = Object.values(LOG_LEVELS);
    const form = document.createElement("form");

    // 获取当前日志级别
    const currentLevel = localStorage.getItem(STORAGE_KEYS.LOG_LEVEL) || LOG_LEVELS.INFO;

    levels.forEach((level) => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.margin = "5px 0";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "loglevel";
      radio.value = level;
      radio.checked = level === currentLevel.toLowerCase();
      radio.style.marginRight = "5px";

      radio.onchange = () => {
        if (radio.checked) {
          const newLevel = level.toUpperCase();
          localStorage.setItem(STORAGE_KEYS.LOG_LEVEL, newLevel);
          
          // 选择日志级别后等待500ms关闭浮窗
          setTimeout(() => {
            panel.style.display = "none";
          }, 200);
        }
      };

      label.appendChild(radio);
      label.appendChild(document.createTextNode(level));
      form.appendChild(label);
    });

    panel.appendChild(form);

    // 创建关键字过滤输入框
    const keywordTitle = document.createElement("p");
    keywordTitle.textContent = "关键字过滤:";
    keywordTitle.style.margin = "15px 0 5px 0";
    keywordTitle.style.fontWeight = "bold";
    keywordTitle.style.fontSize = "13px";
    panel.appendChild(keywordTitle);

    const keywordDesc = document.createElement("p");
    keywordDesc.textContent = "日志如果以关键字开头则显示，否则不显示";
    keywordDesc.style.margin = "0 0 5px 0";
    keywordDesc.style.fontSize = "11px";
    keywordDesc.style.color = "#666";
    panel.appendChild(keywordDesc);

    // 创建输入框
    const keywordInput = document.createElement("input");
    keywordInput.type = "text";
    keywordInput.placeholder = "输入关键字";
    keywordInput.value = localStorage.getItem(STORAGE_KEYS.FILTER_KEYWORDS) || "";
    keywordInput.style.cssText = `
      width: 100%;
      padding: 5px;
      margin-bottom: 5px;
      border: 1px solid #ddd;
      border-radius: 3px;
      box-sizing: border-box;
    `;
    
    panel.appendChild(keywordInput);
    
    // 创建按钮容器
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    `;

    // 创建保存按钮
    const saveButton = document.createElement("button");
    saveButton.textContent = "保存";
    saveButton.style.cssText = `
      background: #28a745;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      flex: 1;
      margin-right: 5px;
    `;

    // 添加清除按钮
    const clearButton = document.createElement("button");
    clearButton.textContent = "清除关键字";
    clearButton.style.cssText = `
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      flex: 1;
      margin-left: 5px;
    `;

    // 保存关键词函数
    const saveKeyword = () => {
      const keyword = keywordInput.value.trim();
      localStorage.setItem(STORAGE_KEYS.FILTER_KEYWORDS, keyword);
    };

    // 保存并关闭浮窗函数
    const saveAndClose = () => {
      saveKeyword();
      panel.style.display = "none";
    };

    // 保存按钮点击事件
    saveButton.onclick = saveAndClose;

    // 清除按钮点击事件
    clearButton.onclick = (e) => {
      e.preventDefault();
      keywordInput.value = "";
      localStorage.removeItem(STORAGE_KEYS.FILTER_KEYWORDS);
      panel.style.display = "none";
    };

    // 监听回车键事件
    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        saveAndClose();
      }
    });

    // 添加按钮到容器
    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(clearButton);
    panel.appendChild(buttonContainer);

    // 添加说明
    const info = document.createElement("p");
    info.textContent = "设置将保存在浏览器本地存储中";
    info.style.fontSize = "12px";
    info.style.color = "#666";
    info.style.marginTop = "15px";
    panel.appendChild(info);

    // 按钮点击事件
    button.onclick = () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };

    // 添加到页面
    document.body.appendChild(button);
    document.body.appendChild(panel);
  }

  /**
   * 初始化日志过滤系统
   */
  function initLogFilter() {
    // 检查文档是否已经加载完成
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      setTimeout(createLogFilterControl, 500);
    } else {
      // 否则等待 DOMContentLoaded 事件
      document.addEventListener("DOMContentLoaded", () => {
        setTimeout(createLogFilterControl, 500);
      });
    }
  }

  // 初始化日志过滤系统
  initLogFilter();
})();
