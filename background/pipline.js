// خط لوله اجرای دستور
var pipeline = function (port, onCompleted) {
    this.steps = new Array();
    this.index = 0;
    this.port = port;
    this.onCompleted = onCompleted;
    this.forceStop = false;
}

pipeline.prototype.register = function (action, args, fn) {
    if (isFunction(action)) {
        this.steps.push({
            callback: action,
            args: args,
            type: 'fn'
        });
    } else {
        args = args || {};
        args.action = action;
        this.steps.push({
            args: args,
            callback: fn,
            type: 'page'
        });
    }

    return this;
};

/**
 * رجیستر کردن عملیات بعد از مرحله در حال اجرا
 */
pipeline.prototype.registerAfter = function (action, args, fn) {
    if (isFunction(action)) {
        this.steps.splice(this.index + 1, 0, {
            callback: action,
            args: args,
            type: 'fn'
        });
    } else {
        args = args || {};
        args.action = action;
        this.steps.splice(this.index + 1, 0, {
            args: args,
            callback: fn,
            type: 'page'
        });
    }

    return this;
}

pipeline.prototype.start = function () {
    if(this.forceStop){
        return;
    }
    this.index = -1;
    this.startTime = new Date();
    this.status = 'Started';
    return this.next();
}

pipeline.prototype.next = function (steps, seconds) {
    if(this.forceStop){
        return;
    }
    if (seconds == undefined) {
        if (this.status != 'Started') {
            clog('pipeline is not started');
            return;
        }
        steps = steps || 1;
        this.index += steps;
        if (this.index < this.steps.length) {
            var step = this.steps[this.index];
            if (step.type == 'page') {
                clog('pipeling page call:', step);
                postMessage(this.port, step.args, bind(function (msg) {
                    step.callback(this, msg);
                }, this));
            } else {
                clog('pipeling fn call:', step);
                step.callback(step.args);
            }
        } else {
            clog('pipeline completed');
            this.completed('Completed');
        }
    } else {
        this.timeoutId = setTimeout(bind(function () {
            delete this.timeoutId;
            this.next(steps);
        }, this), seconds * 1000);
    }
}

pipeline.prototype.previous = function (steps, seconds) {
    if(this.forceStop){
        return;
    }
    if (seconds == undefined) {
        if (this.status != 'Started') {
            clog('pipeline is not started');
            return;
        }
        steps = steps || 1;
        this.index -= steps;
        if (this.index > -1) {
            var step = this.steps[this.index];
            if (step.type == 'page') {
                clog('pipeling page call:', step);
                postMessage(this.port, step.args, bind(function (msg) {
                    step.callback(this, msg);
                }, this));
            } else {
                clog('pipeling fn call:', step);
                step.callback(step.args);
            }
        } else {
            clog('pipeline completed');
            this.completed('Completed');
        }
    } else {
        this.timeoutId = setTimeout(bind(function () {
            delete this.timeoutId;
            this.previous(steps);
        }, this), seconds * 1000);
    }
}

pipeline.prototype.end = function () {
    clog('pipeline end');
    this.completed('Stoped');
};

pipeline.prototype.completed = function (status) {
    this.status = status;
    clog('steps:', this.steps.length);
    clog('complete time:', (new Date() - this.startTime) / 1000);
    if (this.onCompleted !== undefined) {
        this.onCompleted();
    }
}

pipeline.prototype.getCurrentStep = function () {
    return this.steps[this.index];
}

pipeline.prototype.retry = function (seconds) {
    if(this.forceStop){
        return;
    }
    seconds = seconds || 0.1;
    this.timeoutId = setTimeout(bind(function () {
        delete this.timeoutId;
        if(this.forceStop){
            return;
        }
        if (this.status != 'Started') {
            clog('retry failed: pipeline is not started');
            return;
        }
        var step = this.steps[this.index];
        clog('pipeling next step:', step);
        postMessage(this.port, step.args, bind(function (msg) {
            step.callback(this, msg);
        }, this));
    }, this), seconds * 1000);
}

pipeline.prototype.stop = function(){
    this.forceStop = true;
    if(this.timeoutId!=undefined){
        clearTimeout(this.timeoutId);
    }
}
