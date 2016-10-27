/**
 * کلاس تب
 */
var tab = function (id, port) {
    this.id = id;
    this.setPort(port);
};

/**
 * رویداد زمان اتصال به تب
 */
tab.prototype.onConnect = function (fn) {
    if (fn !== undefined && isFunction(fn)) {
        this.onConnectCallback = fn
    } else {
        if (this.onConnectCallback !== undefined) {
            this.onConnectCallback();
        }
    }
};

/**
 * حذف اتصال به تب
 */
tab.prototype.removeOnConnect = function () {
    if (this.onConnectCallback !== undefined) {
        delete this.onConnectCallback;
    }
};

/**
 * اتصال پورت به تب
 */
tab.prototype.setPort = function (port) {
    this.port = port;

    //اضافه کردن لیستنر
    chrome.pageAction.show(this.id);
    port.onMessage.addListener(function (msg) {
        if (msg.action != undefined && msg.action != null) {
            if (msg.action.indexOf("callback.") == 0) {
                var id = msg.action.split('.')[1];
                invokeCallback(id, msg);
            } else {

            }
        }
    });
    port.onDisconnect.addListener(function (msg) {

    });


    clog('get shared data');
    //دریافت اطلاعات صفحه
    this.postMessage({ action:'getSharedData' },bind(function(msg){
        //صدا زدن پس از گرفتن اطلاعات
        clog('share data extracted');
        this.onConnect();
        if(msg.result){
            this.sharedData = msg.sharedData;
        }else{

        }
    },this));
};

/**
 * ارسال پیام
 */
tab.prototype.postMessage = function (args, fn) {
    postMessage(this.port, args, fn);
};

/**
 * ایجاد پایپ لاین
 */
tab.prototype.createPipeline = function (onCompleted) {
    return new pipeline(this.port, onCompleted);
};

tab.prototype.getViewer = function()
{
    if(this.sharedData!=undefined && this.sharedData.config.viewer != null){
        return this.sharedData.config.viewer;
    }
    return null;
};
