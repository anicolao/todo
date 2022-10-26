module.exports = function (wallaby) {
	return {
		autoDetect: true,
		maxConsoleMessagesPerTest: 100000,
		maxTraceSteps: 4000000,
		tests: ['tests/**/*.unit.ts']
	};
};
