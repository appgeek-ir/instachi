// تولید کننده کار
var taskService = {
    waitingList: new Array(),
    create: function (args) {
        var task;
        switch (args.type) {
            case 'Follow':
                task = new followTask(args);
                break;
            case 'Unfollow':
                task = new unfollowTask(args);
                break;
            case 'Restore':
                task = new restoreTask(args);
                break;
        }
        if (task === undefined) {
            return false;
        }
        //فعلن نیازی به این کار نیست
        //task.persist();
        //راه اندازی خودکار
        if (args.startType == 'auto') {
            this.run(task);
        }
        return true;
    },
    run: function (task) {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, bind(function (items) {
            //اولویت با تب جاری است
            if (items.length > 0 && tabs[items[0].id].task !== undefined) {
                tabs[items[0].id].task = task;
                task.completed = bind(this.taskCompleted, this);
                task.start(tabs[items[0].id]);
            } else {
                //بررسی سایر تب ها
                var findFlag = false;
                for (var i in tabs) {
                    if (tabs[i].task === undefined) {
                        tabs[i].task = task;
                        findFlag = true;
                        task.completed = bind(this.taskCompleted, this);
                        task.start(tabs[i]);
                    }
                }
                if (!findFlag) {
                    this.waitingList.push(task.id);
                }
            }
        }, this));
    },
    taskCompleted: function (task) {
        if (tabs[task.tabId] !== undefined) {
            delete tabs[task.tabId].task;
        }
    },
    stop: function(task){
        task.stop();
        this.taskCompleted(task);
    }
}
