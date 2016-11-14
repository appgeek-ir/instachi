var currentSection,
    templates = {},
    callbacks = {},
    port = chrome.extension.connect({
        name: "popup"
    });

/**
 * دریافت پاسخ از پس زمینه
 */
port.onMessage.addListener(function (msg) {
    if (msg.action != undefined &&
        msg.action != null) {
        if (msg.action.indexOf('callback.') == 0) {
            var action = msg.action.split('.')[1];
            if (callbacks[action] !== undefined) {
                callbacks[action](msg);
                delete callbacks[action];
            }
        } else {
            // فعلن از پس زمینه تابعی فراخوانی نمی شود
        }
    }
});
// functions

/**
 * ارسال پیام به پس زمینه
 */
function postMessage(msg, callback) {
    callbacks[msg.action] = callback;
    port.postMessage(msg);
}

/**
 * لود کردن کنترلر مربوطه
 */
function loadCtrl(ctrl) {
    clog(ctrl);
    if (window[ctrl] !== undefined) {
        window[ctrl].init();
    }
}

function getTemplate(id,args){
    args = args || {};
    if (templates[id] == undefined) {
        templates[id] = doT.template($('#' + id + '-template').html());
    }
    return templates[id](args);
}


/**
 * نمایش تمپلیت
 */
function showTemplate(id,args) {
    args = args || {};
    $('section#error').hide();
    currentSection = id;
    if (templates[id] == undefined) {
        templates[id] = doT.template($('#' + id + '-template').html());
    }
    var $main = $('section#main');
    $main.html(templates[id]({}));
}

/**
 * نمایش خطا
 */
function error(msg) {
    $('section#error').show();
    $('section#error>div').text(msg);
}

/**
 * clog
 */
function clog() {
    for (var i in arguments) {
        console.log(arguments[i]);
    }
}


// منوی اصلی
var mainCtrl = {
    init: function () {
        $('.loader').hide();
        postMessage({
            action: 'activationStatus'
        }, $.proxy(this.activationStatusReponse, mainCtrl));
    },
    initMain: function () {

        this.getCurrentTask();

    },
    initActivation: function () {

    },
    activationStatusReponse: function (msg) {
        if (msg.result) {
            postMessage({
                action: 'loginStatus'
            }, $.proxy(this.loginStatusResponse, mainCtrl));
        } else {
            showTemplate('activation');
            this.initActivation();
        }
    },
    loginStatusResponse: function (msg) {
        if (msg.result) {
            showTemplate('main');
            this.initMain();
        } else {
            showTemplate('login');
        }
    },
    getCurrentTask:function(){
      postMessage({
            action: 'getCurrentTask'
        }, $.proxy(this.getCurrentTaskResponse, this));
    },

    getCurrentTaskResponse: function(msg){
        clog('get task response:' , msg);
        $('.running-task').remove();
        if (msg.result) {
            if (msg.task.progress == 0) {
                $('.loader').show();
            }
            $('section#main').find('ul').hide();

            if(msg.task.waitUntil!=undefined){
                var wait = new Date(Date.parse(msg.task.waitUntil))- new Date();
                if(wait>0){
                    var min = Math.floor(wait/60000);
                    var sec = Math.floor((wait%60000)/1000);
                    msg.task.wait = (min>0? (min.toString() +" دقیقه "):"") +  sec.toString() + " ثانیه ";
                }
            }
            var html = getTemplate('running-task',msg.task);
            $(html).insertBefore('ul');
            $('#btn-stop').on('click',$.proxy(this.stopTask,this));
            setTimeout($.proxy(this.getCurrentTask,this),500);
        } else {
            $('.loader').hide();
            $('section#main').find('ul').show();
            $('section#main').find('a').on('click', function (e) {
                e.preventDefault();
                var $this = $(this);
                loadCtrl($this.prop('target'));
            });
            $('section#main').find('#donation').on('click',function(e){
                e.preventDefault();
                var newURL = "http://www.reyhansoft.com/instachi/donate";
                chrome.tabs.create({ url: newURL });
            });
            var that = this;
            $('section#main').find('#get-profile-pic').on('click', function (e) {
                e.preventDefault();
                clog('call get profile picture');
                postMessage({
                    action: 'getProfilePicture'
                }, $.proxy(that.getProfilePictureResponse, that));
            });
            $('section#main').find('#get-media').on('click', function (e) {
                e.preventDefault();
                clog('call get media');
                postMessage({
                    action: 'getMedia'
                }, $.proxy(that.getProfilePictureResponse, that));
            });
        }
    },

    stopTask: function(e){
        e.preventDefault();
        clog('call for stop');
        postMessage({
            action: 'stopTask'
        }, $.proxy(this.stopTaskResponse, this));
    },
    stopTaskResponse: function(msg){
        clog('stop task response', msg);
        if (msg.result) {
            loadCtrl('mainCtrl');
        } else {
            error(msg.message);
        }
    },
    getProfilePictureResponse: function (msg) {
        if (msg.result) {
            $('#main-success').text('درخواست دانلود با موفقیت صادر شد');
            $('#main-success').show();
            setTimeout(function () {
                $('#main-success').hide();
            }, 5000);
        } else {
            $('#main-error').text('امکان دانلود وجود ندارد!');
            $('#main-error').show();
            setTimeout(function () {
                $('#main-error').hide();
            }, 5000);
        }
        clog('get completed', msg);
    }
}
window['mainCtrl'] = mainCtrl;

/**
 * کنترلر فالو
 */
window['followCtrl'] = {
    currentPage: null,
    init: function () {
        // دریافت صفحه جاری
        this.currentPage = null;
        postMessage({
            action: 'getCurrentPage'
        }, $.proxy(this.getCurrentPageResponse, this));

        //نمایش تمپلیت فالو
        showTemplate('follow');
        var $main = $('section#main'),
            that = this;
        // دکمه بازگشت
        $main.find('a.button-return').on('click', function (e) {
            e.preventDefault();
            loadCtrl('mainCtrl');
        });
        // دکمه اجرا
        $main.find('button').on('click', function (e) {
            that.createTask();
        });
    },

    /**
     * ایجاد وظیفه
     */
    createTask: function () {
        var pattern = $('#pattern').val(),
            msg = {
                action: 'createTask',
                type: 'Follow',
                checkFollowHistory: $('#check-history').is(':checked'),
                startType: 'auto',
                count: $('#count').val()
            };

        if (pattern == 'tag') {
            var tag = $('#follow-tag').val().trim();
            if (tag == '') {
                clog('hashtag is required!');
                error('هش تگ مورد نظر را وارد نمایید!');
                return;
            }
            msg.tag = tag;
        } else {
            if (this.currentPage == null) {
                clog('current page is not fetched');
                error('امکان فالو کردن از طریق صفحه جاری امکان پذیر نمی باشد');
                return;
            }
            msg.username = this.currentPage;
        }

        msg.pattern = pattern;
        clog('create task request');
        postMessage(msg, $.proxy(this.createTaskResponse, this));
    },
    /**
    * پاسخ ایجاد وظیفه
    */
    createTaskResponse: function (msg) {
        clog('create task response', msg);
        if (msg.result) {
            loadCtrl('mainCtrl');
        } else {
            error(msg.message);
        }
    },

    /**
    * پاسخ دریافت صفحه جاری
    */
    getCurrentPageResponse: function (msg) {
        clog('get current page response:', msg);
        if (msg.result) {
            this.currentPage = msg.username;
        }
    }
}

/**
 * کنترلر آنفالو
 */
window['unfollowCtrl'] = {

    /**
     * راه اندازی
     */
    init: function () {

        showTemplate('unfollow');
        var $main = $('section#main'),
            that = this;
        $main.find('a.button-return').on('click', function (e) {
            e.preventDefault();
            loadCtrl('mainCtrl');
        });
        $main.find('#btn-run').on('click', function (e) {
            that.createTask('auto');
        });

        $main.find('#btn-sync').on('click',function(e){
            that.createTask('manual');
        });
        postMessage({action:'getFollowingsCount'}, $.proxy(this.getFollowingsCountResponse, this));
        postMessage({action:'getRequestsCount'}, $.proxy(this.getRequestsCountResponse, this));
    },

    /**
     * تولید وظیفه آنفالو
     */
    createTask: function (pattern) {
        msg = {
            action: 'createTask',
            type: 'Unfollow',
            pattern: pattern,
            checkFollowStatus: $('#check-follow-status').is(':checked'),
            checkRequests: $('#check-requests').is(':checked'),
            startType: 'auto',
            count: $('#count').val()
        };

        clog('create unfollow task request');
        postMessage(msg, $.proxy(this.createTaskResponse, this));
    },
    createTaskResponse: function (msg) {
        clog('create task response', msg);
        if (msg.result) {
            loadCtrl('mainCtrl');
        } else {
            error(msg.message);
        }
    },

    getRequestsCountResponse: function(msg){
        clog('get requests count response',msg);
        if(msg.result){
            $('#requests-count').text(msg.count);
        }else{

        }
    },

    getFollowingsCountResponse: function(msg){
        clog('get followings count response',msg);
        if(msg.result){
            $('#followings-count').text(msg.count);
        }else{

        }
    }
};


window['aboutCtrl'] = {

    init: function(){
        showTemplate('about');
        var $main = $('section#main');
        $main.find('a.button-return').on('click', function (e) {
            e.preventDefault();
            loadCtrl('mainCtrl');
        });

        $main.find('#site-link').on('click',function(e){
            e.preventDefault();
            var newURL = "http://www.reyhansoft.com/";
            chrome.tabs.create({ url: newURL });
        });
    }

}

window['backupCtrl'] = {
    init: function () {
        showTemplate('file');
        var $main = $('section#main'),
            that = this;
        $main.find('a.button-return').on('click', function (e) {
            e.preventDefault();
            loadCtrl('mainCtrl');
        });
        $main.find('#btn-backup').on('click', function (e) {
            e.preventDefault();
            postMessage({ action: 'backup' }, $.proxy(that.backupToFile, that));
        });

        $main.find('#btn-restore').on('click', $.proxy(this.btnRestoreClick, this));
        $main.find('#file-input').on('change', $.proxy(this.readSingleFile, this));
        $main.find('#btn-confirm-restore').on('click', $.proxy(this.doRestore, this));
        postMessage({ action: 'getViewer' }, $.proxy(this.getViewerResponse, this));
    },
    getViewerResponse: function(msg){
        this.viewer = msg.viewer;
    },

    btnRestoreClick: function(e){
        e.preventDefault();
        $('#file-input').click();
    },

    backupToFile: function(msg)
    {
        clog('backup respnse:', msg);
        $('#backup-message').show();
    },
    readSingleFile: function (e) {
        
        var file = e.target.files[0];
        if (!file) {
            clog('file not selected');
            return;
        }
        clog('file selected');
        var reader = new FileReader();
        reader.onload = $.proxy(this.onloadFileEvent, this);
        reader.onerror = function (e) {
            clog('can not read file', e);
        };
        reader.readAsText(file);
    },

    onloadFileEvent: function (e) {
        var contents = e.target.result;
        if (contents !== undefined && contents != null) {
            this.data = JSON.parse(contents);
            if (this.viewer != undefined && this.data.id == this.viewer.id) {
                $('#restore-warning').show();
                $('#restore-warning').find('span').text(this.data.username);
            } else {
                error('نسخه پشتیبان مربوط به این حساب کاربری نمی باشد!');
            }
        } else {
            clog('file does not have any contents');
        }
    },

    createTask: function (data) {
        var msg = {
            action: 'createTask',
            type: 'Restore',
            data: data,
            startType: 'auto'
        };
        postMessage(msg, $.proxy(this.createTaskResponse, this));
    },
    createTaskResponse: function (msg) {
        clog('create task response', msg);
        if (msg.result) {
            loadCtrl('mainCtrl');
        } else {
            error(msg.message);
        }
    },
    doRestore: function () {
        clog('do restore');
        this.createTask(this.data);
        delete this.data;
    }

}

window['likeCtrl'] = {
    init: function () {
        showTemplate('like');
        var $main = $('#main');

        $main.find('a.button-return').on('click', function (e) {
            e.preventDefault();
            loadCtrl('mainCtrl');
        });
        $main.find('#btn-run').on('click', $.proxy(this.createTask, this));

    },

    createTask: function (e) {
        e.preventDefault();
        msg = {
            action: 'createTask',
            type: 'Like',
            pattern: 'feeds',
            days: parseInt($('#days').val()),
            startType: 'auto',
            speed: parseInt($('#speed').val())
        };

        clog('create like task request');
        postMessage(msg, $.proxy(this.createTaskResponse, this));
    },

    createTaskResponse: function (msg) {
        clog('create task response', msg);
        if (msg.result) {
            loadCtrl('mainCtrl');
        } else {
            error(msg.message);
        }
    }

}

//initialize
Zepto(function ($) {

    loadCtrl('mainCtrl');

})
