/**
 * کنترلر پپ آپ
 */
var popupCtrl = {
    activationStatus: function (port, msg) {
        clog('activation status: ', msg);
        port.postMessage({
            action: 'callback.activationStatus',
            result: true
        });
    },
    loginStatus: function (port, msg) {
        clog('login status: ', msg);
        port.postMessage({
            action: 'callback.loginStatus',
            result: true
        });
    },
    /**
     * ایجاد وظیفه
     */
    createTask: function (port, msg) {
        clog('create task request:', msg);
        //تولید وظیفه
        var result = taskService.create(msg);
        //بازگردانی نتیجه
        port.postMessage({
            action: 'callback.createTask',
            result: result
        });
    },
    getCurrentPage: function (port, msg) {
        clog('get current page request:', msg);
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function (items) {
            if (items.length > 0) {
                tabs[items[0].id].postMessage({
                    action: 'getCurrentPage'
                }, function (msg) {
                    clog('get current page response :', msg);
                    port.postMessage({
                        action: 'callback.getCurrentPage',
                        result: msg.result,
                        username: msg.username
                    });
                });
            } else {
                port.postMessage({
                    action: 'callback.getCurrentPage',
                    result: false
                });
            }
        });
    },
    getCurrentTask: function (port, msg) {
        clog('get current task',msg );
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function (items) {
            if (items.length > 0) {
                if (tabs[items[0].id].task != undefined) {
                    clog('task found');
                    port.postMessage({
                        action: 'callback.getCurrentTask',
                        result: true,
                        task: tabs[items[0].id].task.getStatus()
                    });
                } else {
                    clog('task not found');
                    port.postMessage({
                        action: 'callback.getCurrentTask',
                        result: false
                    });
                }
            } else {
                clog('tab not found');
                port.postMessage({
                    action: 'callback.getCurrentTask',
                    result: false
                });
            }
        });

    }
};
