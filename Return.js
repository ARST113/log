/**
 * Continue Watching Widget
 * This plugin creates a widget on the main page showing the last viewed items
 */

(function() {
    // Configuration
    const MAX_HISTORY_ITEMS = 1000; // Maximum number of items to store in history
    const STORAGE_KEY = 'continue_watching'; // Storage key for history items

    /**
     * Save the current item to the continue watching history
     * @param {Object} card - The card object containing metadata about the viewed item
     * @param {Object} params - Additional parameters like current address
     */
    function saveToHistory(card, params) {
        if (!card || !card.id) return;
        
        // Get current history or initialize empty array
        let history = Lampa.Storage.get(STORAGE_KEY, []);
        
        // Create history item
        const historyItem = {
            id: card.id,
            title: card.title || card.name || 'Unknown',
            poster: card.poster || card.img || '',
            timestamp: Date.now(),
            time: card.timeline ? card.timeline.time : 0,
            duration: card.timeline ? card.timeline.duration : 0,
            address: params ? params.url || '' : '',
            card: card // Store the original card object
        };
        
        // Remove this item if it already exists (to prevent duplicates)
        history = history.filter(item => item.id !== historyItem.id);
        
        // Add new item to the beginning of the array
        history.unshift(historyItem);
        
        // Limit the history size
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        
        // Save to Storage
        Lampa.Storage.set(STORAGE_KEY, history);
    }
    
    /**
     * Get all items from history
     * @returns {Array} History items
     */
    function getHistoryItems() {
        return Lampa.Storage.get(STORAGE_KEY, []);
    }
    
    /**
     * Format time for display
     * @param {Number} seconds - Time in seconds
     * @returns {String} Formatted time
     */
    function formatTime(seconds) {
        return Lampa.Utils.secondsToTime(seconds);
    }
    
    /**
     * Calculate progress percentage
     * @param {Number} time - Current time in seconds
     * @param {Number} duration - Total duration in seconds
     * @returns {Number} Progress percentage (0-100)
     */
    function calculateProgress(time, duration) {
        if (!duration || duration === 0) return 0;
        let progress = (time / duration) * 100;
        return Math.min(100, Math.max(0, progress)); // Clamp between 0-100
    }
    
    /**
     * Create the continue watching widget for the home page
     */
    function createWidget() {
        // Register the widget
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                // Add the widget to the home page
                const continueWatchingWidget = {
                    title: 'Продолжить просмотр',
                    tag: 'continue_watching',
                    classes: 'continue-watching',
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 16.5V7.5L16 12L10 16.5Z" fill="currentColor"/></svg>',
                    data: getHistoryItems
                };
                
                Lampa.Listener.follow('app.element.create', function(element) {
                    if (element.element && element.element.tag === 'continue_watching') {
                        renderItems(element.body);
                    }
                });
                
                // Add widget to home page
                Lampa.Listener.follow('app.ready', function() {
                    Lampa.Component.add('continue_watching', continueWatchingWidget);
                });
            }
        });
    }
    
    /**
     * Render history items in the widget
     * @param {HTMLElement} container - Container to render items in
     */
    function renderItems(container) {
        const items = getHistoryItems();
        
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="empty-list">Нет недавно просмотренных элементов</div>';
            return;
        }
        
        let html = '<div class="items-container">';
        
        items.forEach((item) => {
            const progress = calculateProgress(item.time, item.duration);
            const timeString = formatTime(item.time) + (item.duration ? ' / ' + formatTime(item.duration) : '');
            
            html += `
                <div class="continue-item" data-id="${item.id}" data-address="${item.address}">
                    <div class="continue-poster">
                        <img src="${item.poster}" alt="${item.title}">
                        <div class="continue-progress">
                            <div class="continue-progress-bar" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    <div class="continue-title">${item.title}</div>
                    <div class="continue-time">${timeString}</div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add event listeners to items
        const itemElements = container.querySelectorAll('.continue-item');
        itemElements.forEach((element) => {
            element.addEventListener('click', function() {
                const id = this.dataset.id;
                const address = this.dataset.address;
                const item = items.find(i => i.id === id);
                
                if (item && item.card) {
                    // Open the card
                    Lampa.Activity.push({
                        url: address,
                        component: 'full',
                        id: id,
                        card: item.card,
                        method: 'tv',
                        source: 'continue_watching'
                    });
                }
            });
        });
    }
    
    /**
     * Initialize the plugin
     */
    function init() {
        // Add styles for the widget
        const style = document.createElement('style');
        style.textContent = `
            .continue-watching .items-container {
                display: flex;
                overflow-x: auto;
                padding: 10px 0;
            }
            
            .continue-watching .continue-item {
                width: 200px;
                margin-right: 15px;
                cursor: pointer;
                position: relative;
            }
            
            .continue-watching .continue-poster {
                position: relative;
                width: 100%;
                height: 300px;
                border-radius: 8px;
                overflow: hidden;
            }
            
            .continue-watching .continue-poster img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .continue-watching .continue-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background-color: rgba(255, 255, 255, 0.3);
            }
            
            .continue-watching .continue-progress-bar {
                height: 100%;
                background-color: #15bdff;
            }
            
            .continue-watching .continue-title {
                margin-top: 8px;
                font-weight: bold;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .continue-watching .continue-time {
                font-size: 12px;
                color: #999;
            }
            
            .continue-watching .empty-list {
                padding: 20px;
                text-align: center;
                color: #999;
            }
        `;
        document.head.appendChild(style);
        
        // Hook into player events to save history
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'destroy') {
                // Player was closed, save the current card and time
                if (e.object && e.object.card) {
                    saveToHistory(e.object.card, e.object.params);
                }
            }
        });
        
        // Create the widget
        createWidget();
        
        // Add Storage sync
        Lampa.Storage.sync(STORAGE_KEY, 'array_object_id');
    }
    
    // Run initialization when app is ready
    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') {
            init();
        }
    });
})();
