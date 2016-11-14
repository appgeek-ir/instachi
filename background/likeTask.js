/// <reference path="app.js" />

var likeTask = function (args) {
    this.id = idGenerator();
    this.state = args;
    this.status = 'Stop';
    if (this.state.currentStep == undefined) {
        this.state.progress = 0;
        this.state.likesCount = 0;
        this.state.outOfRangeFeed = 0;
        this.state.continueLoadFeeds = true;
        if (this.state.pattern == 'feeds') {
            this.state.currentStep = 'likeFromFeeds';
        }
    }
};

/**
 * ذخیره سازی اطلاعات وظیفه
 */
likeTask.prototype.persist = function (status) {
    persistTask(undefined, {
        id: this.id,
        status: status,
        state: this.state
    });
};

/**
 * شروع وظیفه
 */
likeTask.prototype.start = function (tab) {
    this.tab = tab;
    this.tabId = tab.id;
    this.port = tab.port;
    if (this.status != 'Start') {
        this.status = 'Start';
        clog('start task', this);
        this[this.state.currentStep]();
    } else {
        clog('task is already started: ', this);
    }
};

likeTask.prototype.likeFromFeeds = function () {
    clog('start like from feeds');

    this.tab.onConnect(bind(function (port) {
        clog('connect after going to feed page');
        this.tab.removeOnConnect();
        if (this.forceStop()) {
            clog('force task to stop');
            return;
        }
        this.pipeline = this.tab.createPipeline(bind(function () {
            this.completed(this);
        }, this));
        this.pipeline.register('getFeedPageInfo', {}, bind(this.getFeedsCycle, this));
        this.pipeline.start();
    }, this));

    this.tab.postMessage({
        action: 'gotoFeedPage',
        username: this.state.username
    });
};


likeTask.prototype.getFeedsCycle = function (pipeline, msg) {
    clog('get feeds', msg);
    if (this.forceStop()) {
        clog('force task to stop');
        return;
    }
    if (msg.result) {
        var feed;
        if (msg.response !== undefined) {
            if (msg.response.status == 200) {
                feed = msg.response.data.feed;
            } else {
                //خطایی ممکن است رخ بدهد
                // مثلن نتوانیم به اینستاگرام وصل شویم
            }
        } else {
            feed = msg.feed;
        }
        if (this.state.continueLoadFeeds && feed.media.page_info.has_next_page) {
            clog('more feeds are comming');
            pipeline.register('loadMoreFeeds', {}, bind(this.getFeedsCycle, this));
        }
        var selectedDate = new Date();
        selectedDate.setDate(selectedDate.getDate() - this.state.days);
        var anyPost;
        for (var i in feed.media.nodes) {
            var node = feed.media.nodes[i],
                date = new Date(node.date * 1000);
            if (date >= selectedDate) {
                anyPost = true;
                if (!node.likes.viewer_has_liked) {
                    pipeline.register('likeFromFeed', { id: node.id, code: node.code, userId: node.owner.id }, bind(this.postLiked, this));
                } else {
                    clog('you liked it before');
                }
            } else {
                clog('out of range feed', date, selectedDate);

                this.state.outOfRangeFeed++;
            }
        }
        if (anyPost) {
            pipeline.register('removeFeedPosts', { count: 12 }, bind(function (pipeline, msg) { pipeline.next(); }, this));
        }
        this.state.continueLoadFeeds = anyPost;
        pipeline.next(1,1);
    } else {
        // کاربر وجود ندارد یا خطای دریافت داشتیم
        clog('can not get feeds');
        pipeline.next();
    }
}

likeTask.prototype.postLiked = function (pipeline, msg) {
    clog('post liked:', msg);
    if (this.forceStop()) {
        clog('force task to stop');
        return;
    }
    if (msg.result) {
        if (msg.response.status == 200) {
            if (msg.response.data.status == 'ok') {
                clog('like completed');
                this.state.likesCount++;
            } else {
                clog('failed like request');
            }
            pipeline.next(1, this.state.speed);
        } else {
            var rnd = Math.floor(Math.random() * 6) + 5;
            clog('blocked or network error, retry' + rnd + 'min again', this.state);
            var waitUntil = new Date();
            waitUntil.setSeconds(waitUntil.getSeconds() + rnd * 60);
            this.state.waitUntil = waitUntil;
            setTimeout(bind(this.endWaiting, this), rnd * 60 * 1000);
            //بلاک شدن یا عدم اتصال به اینترنت و ..
            pipeline.next(1, rnd * 60);
        }
    } else {
        clog('like failed!');
        pipeline.next(1, this.state.speed);
    }
};

/**
 * دریافت وضعیت وظیفه
 */
likeTask.prototype.getStatus = function () {
    var currentStep;
    switch (this.state.currentStep) {
        case 'likeFromFeeds':
            currentStep = 'لایک پست های فید';
            break;
    }

    return {
        type: 'لایک',
        progress: this.state.progress > 100 ? 100 : Math.floor(this.state.progress),
        step: currentStep,
        waitUntil: this.state.waitUntil != undefined ? this.state.waitUntil.toISOString() : undefined,
        states: [
            {
                name: 'تعداد لایک ها',
                value: this.state.likesCount
            }
        ]
    };
};

/**
 * اتمام وظیفه فالو
 */
likeTask.prototype.completed = function () { /* nothing */ };

/**
 * بررسی پایان کار اجباری
 */
likeTask.prototype.forceStop = function () {
    return this.stopSignal;
}

/**
 * متوقف کردن وظیفه
 */
likeTask.prototype.stop = function () {
    this.stopSignal = true;
    if (this.pipeline != undefined) {
        this.pipeline.stop();
    }
}
