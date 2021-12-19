import assert from 'assert';
import { app, mock } from 'egg-mock/bootstrap';
import { Context } from 'egg';
import { ChangesStreamService } from 'app/core/service/ChangesStreamService';
import { Task } from 'app/repository/model/Task';

describe('test/schedule/ChangesStreamWorker.test.ts', () => {
  let ctx: Context;
  let changesStreamService: ChangesStreamService;
  beforeEach(async () => {
    ctx = await app.mockModuleContext();
    changesStreamService = await ctx.getEggObject(ChangesStreamService);
  });

  afterEach(async () => {
    app.destroyModuleContext(ctx);
  });

  it('should work', async () => {
    app.mockLog();
    // syncMode=none
    await app.runSchedule('ChangesStreamWorker');
    app.notExpectLog('[ChangesStreamWorker:start]');

    // syncMode=all
    mock(app.config.cnpmcore, 'syncMode', 'all');
    await app.runSchedule('ChangesStreamWorker');
    app.notExpectLog('[ChangesStreamWorker:start]');

    // syncMode=all and enableChangesStream = true
    mock(app.config.cnpmcore, 'syncMode', 'all');
    mock(app.config.cnpmcore, 'enableChangesStream', true);
    await app.runSchedule('ChangesStreamWorker');
    app.expectLog('[ChangesStreamWorker:start]');
    const task = await changesStreamService.findExecuteTask();
    assert(!task, 'task should not exists');

    // mock no changed after 2 mins
    const existsTask = await Task.findOne({ type: 'changes_stream' });
    assert(existsTask);
    existsTask.updatedAt = new Date(existsTask.updatedAt.getTime() - 120001);
    await existsTask.save();
    // mock request https://replicate.npmjs.com/_changes error
    app.mockHttpclient(/https:\/\/replicate.npmjs.com\/_changes/, () => {
      throw new Error('mock request replicate _changes error');
    });
    await app.runSchedule('ChangesStreamWorker');
    app.expectLog('[ChangesStreamService.executeTask:error]');
    app.expectLog('mock request replicate _changes error');
  });

  it('should mock get update_seq error', async () => {
    app.mockLog();
    mock(app.config.cnpmcore, 'syncMode', 'all');
    mock(app.config.cnpmcore, 'enableChangesStream', true);
    app.mockHttpclient(/https:\/\/replicate.npmjs.com\//, () => {
      throw new Error('mock request replicate error');
    });
    await app.runSchedule('ChangesStreamWorker');
    app.expectLog('[ChangesStreamWorker:start]');
    app.expectLog('[ChangesStreamService.executeTask:error]');
    app.expectLog('mock request replicate error');
  });
});
