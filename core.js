var Q = require('q');
var path = require('path');
var url = require('url');

var Tasks = require('./tasks.js');
var TaskExec = require('./taskexec.js');

function WebRobot(basepath, prefix) {

	this.t = new Tasks(basepath);
	this.te = new TaskExec();
	this.prefix = prefix || '';
	this.debug = true;
	this.eventmap = {};

}

WebRobot.prototype.listTasks = function() {

	var self = this;

	return self.t.getTasks();

}

WebRobot.prototype.getTask = function(taskid) {

	var self = this;

	return self.t.getTask(taskid);

}

WebRobot.prototype.getTaskExec = function(taskexecuuid) {

	var self = this;

	return self.te.getTaskExec(taskexecuuid);	

}

WebRobot.prototype.createTaskExecution = function(task, data, tmpdir) {
	
	var self = this;

	var taskexec = new TaskExec(task, self);
	task.tmpdir = path.join(tmpdir, taskexec.uuid);

	return taskexec.setupTaskValues(data)
	.then(function() {
		return taskexec.uuid;
	})
	.catch(function(err) {
		console.log(err.stack);
		throw err;
	});

}

WebRobot.prototype.on = function(eventname, callback) {

	var self = this;

	self.eventmap[eventname] = callback;

};

WebRobot.prototype.trigger = function(eventname, data) {

	var self = this;

	console.log('Triggering', eventname, data);

	var cb = self.eventmap[eventname];
	if (!cb) return console.log('Event callback not found', eventname);

	cb(data);

};

WebRobot.prototype.setupRoutes = function(app) {

	var self = this;

	if (self.debug) console.log('Registering: ', [self.prefix, '/static/*'].join(''));
	app.get([self.prefix, '/static/*'].join(''), function(req, res) {

		res.sendFile(path.resolve(__dirname + req.url.substr(self.prefix.length)));

	});

	if (self.debug) console.log('Registering: ', [self.prefix, '/next/:taskexecuuid'].join(''));
	app.get([self.prefix, '/next/:taskexecuuid'].join(''), function(req, res) {

		var taskexecuuid = req.params.taskexecuuid;

		var sess = req.session;
		sess.taskexecuuid = taskexecuuid;
		
		return self.te.getTaskExec(taskexecuuid)
		.then(function(taskexec) {

			var step = taskexec.nextStep();
			res.redirect(step.url);

		})
		.catch(function(err) {
			console.log(err.stack);
			res.status(404).send(err.message);
		});

	});

	if (self.debug) console.log('Registering: ', [self.prefix, '/lastshot'].join(''));
	app.get([self.prefix, '/*/lastshot'].join(''), function(req, res) {

		var taskexecuuid = req.query.taskexecuuid;

		var sess = req.session;
		sess.taskexecuuid = taskexecuuid;
		
		return self.te.getTaskExec(taskexecuuid)
		.then(function(taskexec) {
			
			res.status(200).send(taskexec.task.lastHTML || '');

		})
		.catch(function(err) {
			console.log(err.stack);
			res.status(404).send(err.message);
		});

	});

	if (self.debug) console.log('Registering: ', [self.prefix, '/current/:taskexecuuid'].join(''));
	app.get([self.prefix, '/current/:taskexecuuid'].join(''), function(req, res) {

		var taskexecuuid = req.params.taskexecuuid;

		var sess = req.session;
		sess.taskexecuuid = taskexecuuid;
		
		return self.te.getTaskExec(taskexecuuid)
		.then(function(taskexec) {

			var step = taskexec.curStep();
			res.redirect(step.url);

		})
		.catch(function(err) {
			console.log(err.stack);
			res.status(404).send(err.message);
		});

	});

	if (self.debug) console.log('Registering: ', [self.prefix, '/*'].join(''));
	app.get([self.prefix, '/*'].join(''), function(req, res) {

		var sess = req.session;
		if (!sess || !sess.taskexecuuid) return res.status(404).send('No session.');

		return self.te.getTaskExec(sess.taskexecuuid)
		.then(function(taskexec) {

			return taskexec.runRequest('GET', req, res, req.url.substr(self.prefix.length), req.headers.host);

		})
		.catch(function(err) {
			console.log(err.stack);
			res.status(404).send(err.message);
		});

	});

	if (self.debug) console.log('Registering: ', [self.prefix, '/*'].join(''));
	app.post([self.prefix, '/*'].join(''), function(req, res) {

		var sess = req.session;
		if (!sess || !sess.taskexecuuid) return res.status(404).send('No session.');

		return self.te.getTaskExec(sess.taskexecuuid)
		.then(function(taskexec) {

			return taskexec.runRequest('POST', req, res, req.url.substr(self.prefix.length), req.headers.host);

		})
		.catch(function(err) {
			console.log(err.stack);
			res.status(404).send(err.message);
		});

	});

}

module.exports = WebRobot;