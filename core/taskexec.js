var Q = require('q');
var request = require('request');
var uuid = require('uuid');
var path = require('path');
var fs = require('fs');

var Step = require('./step.js');
var WebClient = require('./webclient.js');

var DEBUG = true;

var taskexecs = {};

function TaskExec(task, webrobot) {

	this.task = task;
	this.webrobot = webrobot;
	this.jar = request.jar();
	this.context = {};
	this.uuid = uuid.v1();
	
	this.webclient = new WebClient(this.task, this.jar);

	taskexecs[this.uuid] = this;

};

TaskExec.prototype.getTaskExec = function(uuid) {

	var self = this;
	var p = Q();

	return p
	.then(function() {
		if (!(uuid in taskexecs)) throw new Error('Task exec not found:' + uuid);
		return taskexecs[uuid];
	});

}

TaskExec.prototype.nextStep = function(html) {

	var self = this;
	var validstep = null;

	self.context.curstep = self.context.curstep != null ? self.context.curstep : -1;

	var curvalidstep = null;
	if (self.context.curstep != -1) {
		var step = new Step(self.steps[self.context.curstep]);
		curvalidstep = step.isValid() && step.recognize(html) ? step : null;
	}

	// Tries to get a substep from the current step...
	if (curvalidstep && curvalidstep.tasks.length > 0) {

		self.context.cursubstep = self.context.cursubstep == null || self.context.cursubstep == curvalidstep.tasks.length-1 ? -1 : self.context.cursubstep;

		while (self.context.cursubstep < curvalidstep.tasks.length-1 && validstep == null) {
			self.context.cursubstep++;
			var substep = new Step(curvalidstep.tasks[self.context.cursubstep]);
			validstep = substep.isValid() ? substep : null;
		}

	}

	// Tries to get the next step...
	if (!validstep) {

		while (self.context.curstep < self.steps.length-1 && validstep == null) {
			self.context.curstep++;
			var step = new Step(self.steps[self.context.curstep]);
			validstep = step.isValid() ? step : null;
		}

		self.context.cursubstep = -1;

		if (validstep && validstep.tasks.length > 0) {

			var substeps = validstep.tasks;

			validstep = null;
			while (self.context.cursubstep < substeps.length-1 && validstep == null) {
				self.context.cursubstep++;
				var substep = new Step(substeps[self.context.cursubstep]);
				validstep = substep.isValid() ? substep : null;
			}

			if (!validstep) {

				var step = new Step(self.steps[self.context.curstep]);
				validstep = step.isValid() && step.repeatUntilNotRecognized ? step : null;

				while (self.context.curstep < self.steps.length-1 && validstep == null) {
					self.context.curstep++;
					var step = new Step(self.steps[self.context.curstep]);
					validstep = step.isValid() ? step : null;
				}

			}

		}

	}

	return validstep;

};

TaskExec.prototype.curStep = function() {

	var self = this;
	
	var curstep = new Step(self.steps[self.context.curstep], self.prefix);

	if (self.context.cursubstep > -1)
		curstep = new Step(curstep.tasks[self.context.cursubstep], self.prefix);

	return curstep;

};

TaskExec.prototype.runRequest = function(method, req, res, url, host) {

	var self = this;

	return self.webclient.runRequest(self, method, req, res, url, host);

};

TaskExec.prototype.trigger = function(eventtype, data) {

	var self = this;

	self.webrobot.trigger([eventtype, self.uuid].join('-'), data);

};

TaskExec.prototype.setupTaskValues = function(data) {

	var self = this;
	var p = Q();

	self.steps = JSON.parse(JSON.stringify(self.task.steps));

	if (self.steps)
		p = p
		.then(function() {

			var taskprefix = self.task.prefix || '';

			return Q.all(self.steps.map(function(step) {

				var stepprefix = [taskprefix, step.prefix].join('_');
				
				step.tasks = step.tasks ? step.tasks : [];
				step.data = data;

				return Q()
				.then(function() {

					if (!step.fields) return;

					return Q.all(step.fields.map(function(field) {

						var fieldname = [stepprefix, field.name || field.id].join('_');

						if (fieldname in data)
							field['value'] = data[fieldname];
						else if (field['default'])
							field['value'] = field['default'];
						// else
						// 	console.log('Undefined field:', fieldname);

					}))

				})
				.then(function() {

					if (!step.tasks) return;

					return Q.all(step.tasks.map(function(substep) {

						substep.data = data;

						return Q.all(substep.fields.map(function(field) {

							var fieldname = [stepprefix, field.name || field.id].join('_');

							if (fieldname in data)
								field['value'] = data[fieldname];
							else if (field['default'])
								field['value'] = field['default'];
							// else
							// 	console.log('Undefined field:', fieldname);

						}));

					}));

				});

			}));

		});

	if (data.filename)
		p = p
		.then(function() {
			self.filename = data.filename;
		});

	return p;

};

module.exports = TaskExec;