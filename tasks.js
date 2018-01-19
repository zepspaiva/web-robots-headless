var Q = require('q');
var path = require('path');
var fs = require('fs');

var FileSys = require('./filesys.js');

function Tasks(basepath) {

	this.basepath = basepath || './tasks';
	this.taskregex = /.*\.json/i;
	this.filesys = new FileSys();
	this.data = {};

};

Tasks.prototype._prepare = function() {

	var self = this;
	var tasks = [];
	var taskstree = {};

	var p = Q();

	if (self.basepath)
		p = p
		.then(function() {

			return self.filesys.listFiles(self.basepath, self.taskregex)
			.then(function(taskfiles) {

				return Q.all(taskfiles.map(function(taskfile) {
					var taskfilepath = path.join(self.basepath, taskfile);
					return self.filesys.readJsonFile(taskfilepath)
					.then(function(task) {
						task.id = path.basename(taskfile, '.json');
						tasks.push(task);
						taskstree[task.id] = task;
					});
				}));

			});
			
		});

	return p
	.then(function() {
		self.tasks = tasks;
		self.taskstree = taskstree;
		self.ready = true;
	});

};

Tasks.prototype.getTasks = function() {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p
	.then(function() {
		return self.tasks;
	});

};

Tasks.prototype.getTask = function(taskid) {

	var self = this;
	var p = Q();

	if (!self.ready)
		p = p
		.then(function() {
			return self._prepare();
		});

	return p
	.then(function() {
		if (!(taskid in self.taskstree)) throw new Error('Task not found:' + taskid);
		return self.taskstree[taskid];
	});

};

Tasks.prototype.setupTaskValues = function(task, data) {

	var self = this;
	var p = Q();

	task.data = data;

	if (task.steps)
		p = p
		.then(function() {

			var taskprefix = task.prefix || '';

			return Q.all(task.steps.map(function(step) {

				step.data = data;
				if (!step.fields) return;

				var stepprefix = [taskprefix, step.prefix].join('_');

				return Q.all(step.fields.map(function(field) {

					var fieldname = [stepprefix, field.name || field.id].join('_');

					if (fieldname in data)
						field['value'] = data[fieldname];
					else if (field['default'])
						field['value'] = field['default'];
					else
						console.log('Undefined field:', fieldname);

				}));

			}));

		});

	if (data.filename)
		p = p
		.then(function() {
			task.filename = data.filename;
		});

	return p
	.then(function() {
		return task;
	});

};

module.exports = Tasks;