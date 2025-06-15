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
    CONTROL_POSITION: "_logFilterControlPosition", // Using underscore prefix and pixel values
  };

  /**
   * 创建日志控制面板
   */
  function createLogFilterControl() {
    // 只在开发环境显示控制面板
    if (!isDev) {
      return;
    }
    const dragThreshold = 5; // Pixels - Threshold to distinguish click from drag

    // Helper function to apply styles
    function applyStyles(element, styles) {
      for (const property in styles) {
        element.style[property] = styles[property];
      }
    }

    // Helper function to calculate clamped position within viewport
    function getClampedPosition(currentX, currentY, elementWidth, elementHeight, viewportWidth, viewportHeight) {
      const x = Math.max(0, Math.min(currentX, viewportWidth - elementWidth));
      const y = Math.max(0, Math.min(currentY, viewportHeight - elementHeight));
      // Ensure values are not NaN, default to 0 if they are
      return { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y };
    }

    const svgIcon = `<svg t="1749970738262" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8631" width="24" height="24"><path d="M653.88544 0a92.16 92.16 0 0 1 65.09568 26.9312l187.61728 187.21792a92.16 92.16 0 0 1 27.05408 65.2288v120.6272A80.10752 80.10752 0 0 1 1013.76 480.09216v319.7952a80.10752 80.10752 0 0 1-77.55776 80.06656l-2.54976 0.03072v48.00512c0 53.02272-43.02848 96-96.12288 96H196.7104c-53.0944 0-96.12288-42.97728-96.12288-96v-48.00512A80.10752 80.10752 0 0 1 20.48 799.8976v-319.7952a80.10752 80.10752 0 0 1 77.55776-80.06656l2.54976-0.04096V96C100.58752 42.97728 143.616 0 196.7104 0h457.17504zM837.5296 879.99488H196.7104v17.28512a30.72 30.72 0 0 0 30.72 30.72h579.3792a30.72 30.72 0 0 0 30.72-30.72v-17.28512zM504.832 555.78624c-15.89248 0-30.03392 3.11296-42.41408 9.33888-12.36992 6.22592-23.1424 15.63648-32.28672 28.23168-5.69344 7.80288-10.10688 16.9984-13.2096 27.56608a116.13184 116.13184 0 0 0-4.66944 32.96256c0 21.74976 6.2464 38.7584 18.72896 51.01568 12.4928 12.26752 29.87008 18.40128 52.14208 18.40128 14.91968 0 28.55936-3.06176 40.88832-9.17504 12.3392-6.11328 22.86592-14.98112 31.55968-26.60352 6.144-8.32512 10.98752-18.05312 14.51008-29.19424 3.5328-11.14112 5.29408-22.44608 5.29408-33.91488 0-21.52448-6.22592-38.3488-18.67776-50.46272-12.45184-12.11392-29.73696-18.16576-51.8656-18.16576z m193.28-0.22528c-18.83136 0-34.80576 2.3552-47.9232 7.08608a88.22784 88.22784 0 0 0-34.31424 22.38464 79.59552 79.59552 0 0 0-17.7152 27.72992 94.8224 94.8224 0 0 0-6.02112 34.03776c0 24.00256 7.1168 42.63936 21.37088 55.9104 14.25408 13.27104 34.304 19.9168 60.19072 19.9168 10.72128 0 20.5824-0.65536 29.5936-1.97632a150.016 150.016 0 0 0 25.41568-5.89824l18.90304-88.43264h-66.60096L674.816 655.36h26.3168l-7.19872 33.41312a89.8048 89.8048 0 0 1-9.00096 1.85344c-2.7648 0.4096-5.46816 0.6144-8.0896 0.6144-12.9024 0-23.04-3.8912-30.38208-11.69408-7.35232-7.80288-11.02848-18.56512-11.02848-32.28672 0-18.83136 6.00064-33.6384 18.00192-44.4416 12.00128-10.79296 28.5696-16.19968 49.72544-16.19968 6.97344 0 13.6704 0.80896 20.08064 2.41664a80.86528 80.86528 0 0 1 18.62656 7.26016l9.216-32.84992a146.4832 146.4832 0 0 0-25.31328-5.95968 192.45056 192.45056 0 0 0-27.66848-1.91488z m-344.3712 3.93216h-43.07968L276.57216 719.36h108.9024l6.9632-31.8464h-66.14016l27.4432-128.02048z m148.2752 25.98912c9.30816 0 16.50688 3.19488 21.6064 9.56416 5.09952 6.37952 7.64928 15.4112 7.64928 27.11552 0 8.17152-1.15712 16.57856-3.4816 25.1904-2.33472 8.63232-5.36576 15.91296-9.1136 21.83168-5.09952 7.7312-10.42432 13.44512-15.9744 17.16224a31.92832 31.92832 0 0 1-18.1248 5.56032c-8.99072 0-16.0768-3.23584-21.25824-9.728-5.1712-6.48192-7.76192-15.36-7.76192-26.60352 0-8.25344 1.16736-16.71168 3.4816-25.37472 2.33472-8.66304 5.376-16.0256 9.1136-22.09792 4.58752-7.43424 9.73824-13.056 15.47264-16.87552a32.5632 32.5632 0 0 1 18.40128-5.7344zM608.34816 88.32H227.4304a30.72 30.72 0 0 0-30.72 30.72v280.95488h640.8192v-81.5616H700.52864c-50.8928-0.01024-92.14976-41.2672-92.16-92.16l-0.03072-137.95328z m96.12288 59.84256v58.91072a15.36 15.36 0 0 0 15.36 15.36h58.0848l-74.4448-74.27072z" fill="#FF6B08" p-id="8632"></path></svg>`;

    // Create button element
    const button = document.createElement("div");
    button.id = "logFilterControl";
    button.innerHTML = svgIcon;
    applyStyles(button, {
      position: "fixed",
      width: "40px",
      height: "40px",
      backgroundColor: "#f0f0f0", // Light grey background
      borderRadius: "50%",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10000", // High z-index to stay on top
      boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
      userSelect: "none", // Prevent text selection
      border: "1px solid #ccc" // Subtle border
    });

    // Function to ensure button is within viewport
    const ensureButtonInViewport = () => {
      const buttonWidth = button.offsetWidth;
      const buttonHeight = button.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let currentLeft = parseFloat(button.style.left);
      let currentTop = parseFloat(button.style.top);

      if (isNaN(currentLeft) || isNaN(currentTop)) { // If position is not set via left/top (e.g., using bottom/right initially)
        const rect = button.getBoundingClientRect();
        currentLeft = rect.left;
        currentTop = rect.top;
      }

      const { x: newLeft, y: newTop } = getClampedPosition(currentLeft, currentTop, buttonWidth, buttonHeight, viewportWidth, viewportHeight);

      if (newLeft !== currentLeft || newTop !== currentTop) {
        button.style.left = `${newLeft}px`;
        button.style.top = `${newTop}px`;
        button.style.bottom = 'auto';
        button.style.right = 'auto';
        // Re-save position if changed by viewport adjustment
        sessionStorage.setItem(STORAGE_KEYS.CONTROL_POSITION, JSON.stringify({ left: button.style.left, top: button.style.top }));
      }
    };

    // Load saved position or use default
    const savedPosition = sessionStorage.getItem(STORAGE_KEYS.CONTROL_POSITION);
    if (savedPosition) {
      const { left, top } = JSON.parse(savedPosition);
      button.style.left = left;
      button.style.top = top;
    } else {
      button.style.bottom = "20px";
      button.style.right = "20px";
    }
    ensureButtonInViewport(); // Ensure initial position is valid

    // Draggable functionality
    let dragging = false;
    let wasDragged = false; // Flag to distinguish drag from click
    let dragStartX, dragStartY;
    let offsetX, offsetY;

    // Function to handle clicks outside the panel to close it
    let handleClickOutside;

    const removeClickOutsideListener = () => {
      if (handleClickOutside) {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      }
    };

    const addClickOutsideListener = () => {
      removeClickOutsideListener(); // Remove any existing one first
      handleClickOutside = (e) => {
        if (panel.style.display === 'block' && !panel.contains(e.target) && !button.contains(e.target)) {
          panel.style.display = 'none';
          removeClickOutsideListener();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    };

    const startDrag = (event) => {
      // Panel closing logic moved to drag() to avoid flicker on simple click
      dragging = true;
      wasDragged = false; // Reset flag

      // Get the mouse cursor position at startup:
      let clientX = event.clientX;
      let clientY = event.clientY;
      if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      }
      dragStartX = clientX;
      dragStartY = clientY;

      offsetX = clientX - button.getBoundingClientRect().left;
      offsetY = clientY - button.getBoundingClientRect().top;
      button.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const drag = (event) => {
      if (!dragging) return;
      event.preventDefault(); // Prevent page scrolling on touch devices

      let clientX = event.clientX;
      let clientY = event.clientY;
      if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      }

      const currentX = clientX - offsetX;
      const currentY = clientY - offsetY;
      const distX = clientX - dragStartX;
      const distY = clientY - dragStartY;

      // Only set wasDragged and close panel if actual movement beyond threshold occurred
      if (!wasDragged && (Math.abs(distX) > dragThreshold || Math.abs(distY) > dragThreshold)) {
        wasDragged = true;
        // Close panel if it's open, now that we've confirmed it's a drag
        if (panel.style.display === 'block') {
          hidePanel(); // Use helper
        }
      }

      if (wasDragged) {
        const buttonWidth = button.offsetWidth;
        const buttonHeight = button.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const { x: boundedX, y: boundedY } = getClampedPosition(currentX, currentY, buttonWidth, buttonHeight, viewportWidth, viewportHeight);

        button.style.left = `${boundedX}px`;
        button.style.top = `${boundedY}px`;
        button.style.right = 'auto'; // Ensure right/bottom are not interfering
        button.style.bottom = 'auto';
        button.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none'; // Prevent text selection during drag
      }
    };

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      button.style.cursor = 'pointer';
      document.body.style.userSelect = '';
      if (wasDragged) { // Only save if it was a drag
        sessionStorage.setItem(STORAGE_KEYS.CONTROL_POSITION, JSON.stringify({ left: button.style.left, top: button.style.top }));
      }
    };

    button.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);

    button.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            startDrag(e);
        }
    }, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', stopDrag);
    document.addEventListener('touchcancel', stopDrag);

    // Add resize listener to adjust button position
    window.addEventListener('resize', ensureButtonInViewport);

    // Create panel element
    const panel = document.createElement("div");
    panel.id = "logFilterPanel";
    applyStyles(panel, {
      position: "fixed",
      display: "none", // Initially hidden
      width: "280px",
      padding: "15px",
      backgroundColor: "white",
      border: "1px solid #ccc",
      borderRadius: "5px",
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
      zIndex: "10001", // Higher than button
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      color: "#333",
      boxSizing: "border-box"
    });

    // 创建标题
    const title = document.createElement("h3");
    title.textContent = "日志过滤器设置";
    applyStyles(title, {
      marginTop: "0",
      marginBottom: "15px",
      fontSize: "16px",
      color: "#333",
      textAlign: "center",
      borderBottom: "1px solid #eee",
      paddingBottom: "10px"
    });
    panel.appendChild(title);

    // 创建日志级别选择器
    const levelLabel = document.createElement("label");
    levelLabel.textContent = "日志级别:";
    applyStyles(levelLabel, {
      display: "block",
      marginBottom: "5px",
      fontWeight: "bold"
    });
    panel.appendChild(levelLabel);

    const levels = Object.values(LOG_LEVELS);
    const form = document.createElement("form");

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
          setTimeout(() => {
            panel.style.display = "none";
            removeClickOutsideListener(); // Remove listener when panel closes
          }, 200);
        }
      };

      label.appendChild(radio);
      label.appendChild(document.createTextNode(level));
      form.appendChild(label);
    });

    panel.appendChild(form);

    const keywordLabel = document.createElement("label");
    keywordLabel.textContent = "关键字过滤:";
    keywordLabel.setAttribute("for", "logKeywordInput");
    applyStyles(keywordLabel, {
      display: "block",
      marginBottom: "5px",
      fontWeight: "bold"
    });
    panel.appendChild(keywordLabel);

    const keywordDesc = document.createElement("p");
    keywordDesc.textContent = "日志如果以关键字开头则显示，否则不显示";
    keywordDesc.style.margin = "0 0 5px 0";
    keywordDesc.style.fontSize = "11px";
    keywordDesc.style.color = "#666";
    panel.appendChild(keywordDesc);

    const keywordInput = document.createElement("input");
    keywordInput.type = "text";
    keywordInput.placeholder = "输入关键字";
    keywordInput.value = localStorage.getItem(STORAGE_KEYS.FILTER_KEYWORDS) || "";
    applyStyles(keywordInput, {
      width: "100%",
      padding: "5px",
      marginBottom: "5px",
      border: "1px solid #ddd",
      borderRadius: "3px",
      boxSizing: "border-box",
      fontSize: "14px"
    });
    panel.appendChild(keywordInput);

    const buttonContainer = document.createElement("div");
    applyStyles(buttonContainer, {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "10px"
    });

    const saveButton = document.createElement("button");
    saveButton.textContent = "保存";
    applyStyles(saveButton, {
      background: "#28a745",
      color: "white",
      border: "none",
      borderRadius: "3px",
      padding: "5px 10px",
      fontSize: "12px",
      cursor: "pointer",
      flex: "1",
      marginRight: "5px"
    });

    const clearButton = document.createElement("button");
    clearButton.textContent = "清除关键字";
    applyStyles(clearButton, {
      background: "#dc3545",
      color: "white",
      border: "none",
      borderRadius: "3px",
      padding: "5px 10px",
      fontSize: "12px",
      cursor: "pointer",
      flex: "1",
      marginLeft: "5px"
    });

    const saveKeyword = () => {
      const keyword = keywordInput.value.trim();
      localStorage.setItem(STORAGE_KEYS.FILTER_KEYWORDS, keyword);
    };

    // Helper function to hide the panel
    const hidePanel = () => {
      panel.style.display = "none";
      removeClickOutsideListener();
    };

    // Helper function to show and position the panel
    const showPanel = () => {
      panel.style.display = "block";
      const buttonRect = button.getBoundingClientRect();
      const panelHeight = panel.offsetHeight;
      const panelWidth = panel.offsetWidth;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let panelTop = buttonRect.top - panelHeight - 10;
      if (panelTop < 0) {
        panelTop = buttonRect.bottom + 10;
      }
      panelTop = Math.max(0, Math.min(panelTop, viewportHeight - panelHeight));

      let panelLeft = buttonRect.left + (buttonRect.width / 2) - (panelWidth / 2);
      panelLeft = Math.max(0, Math.min(panelLeft, viewportWidth - panelWidth));

      applyStyles(panel, {
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        bottom: 'auto',
        right: 'auto'
      });
      addClickOutsideListener(); // Add listener when panel opens
    };

    const saveAndClose = () => {
      saveKeyword();
      hidePanel(); // Use helper
    };

    saveButton.onclick = saveAndClose;
    clearButton.onclick = (e) => {
      e.preventDefault();
      keywordInput.value = "";
      localStorage.removeItem(STORAGE_KEYS.FILTER_KEYWORDS);
      hidePanel(); // Use helper
    };

    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        saveAndClose();
      }
    });

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(clearButton);
    panel.appendChild(buttonContainer);

    const info = document.createElement("p");
    info.textContent = "设置将保存在浏览器本地存储中";
    applyStyles(info, {
      fontSize: "12px",
      color: "#666",
      marginTop: "15px"
    });
    panel.appendChild(info);

    button.onclick = (e) => {
      if (wasDragged) {
        wasDragged = false; // Reset for next interaction
        return; // Do not toggle panel if it was a drag
      }

      const isPanelVisible = panel.style.display === "block";
      if (isPanelVisible) {
        hidePanel(); // Use helper
      } else {
        showPanel(); // Use helper
      }
    };

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

    // Helper function to calculate clamped position within viewport
    function getClampedPosition(currentX, currentY, elementWidth, elementHeight, viewportWidth, viewportHeight) {
      const x = Math.max(0, Math.min(currentX, viewportWidth - elementWidth));
      const y = Math.max(0, Math.min(currentY, viewportHeight - elementHeight));
      // Ensure values are not NaN, default to 0 if they are
      return { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y };
    }
  }


  initLogFilter();
})();
