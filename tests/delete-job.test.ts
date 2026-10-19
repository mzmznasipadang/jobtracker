import { afterEach, beforeEach, expect, it } from "vitest";
import { createAccountFixture } from "./helpers/accounts";
import { getAccountDb } from "@/lib/db";
import { deleteJob, getJob, startJobWork } from "@/lib/jobs";
let fixture: ReturnType<typeof createAccountFixture>;
beforeEach(() => { fixture = createAccountFixture(); });
afterEach(() => fixture.cleanup());
function seed(account: typeof fixture.owner) {
  getAccountDb(account).prepare("INSERT INTO jobs(url,source,company,title,status) VALUES ('https://example.com/job','other','Acme','Role','applied')").run();
}
it("deletes only the caller's job and cascades outputs while retaining email records", () => {
  const { owner, member } = fixture;
  seed(owner); seed(member);
  const db = getAccountDb(member);
  db.prepare("INSERT INTO tailored(job_id,version,cv_json,pdf) VALUES (1,1,'{}',?)").run(Buffer.from("PDF"));
  db.prepare("INSERT INTO generation_metadata VALUES (1,1,'{}')").run();
  db.prepare("INSERT INTO events(job_id,kind,data_json) VALUES (1,'note','{}')").run();
  db.prepare("INSERT INTO emails(id,job_id) VALUES ('message',1)").run();
  deleteJob(member, 1);
  expect(getJob(member, 1)).toBeNull();
  expect(getJob(owner, 1)?.status).toBe("applied");
  for (const table of ['tailored','generation_metadata','events']) expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({n:0});
  expect(db.prepare("SELECT job_id FROM emails WHERE id='message'").get()).toEqual({job_id:null});
  expect(() => deleteJob(member, 1)).toThrow(/not found/);
});
it("rejects deletion during background work, then permits it after completion", async () => {
  seed(fixture.member);
  let finish!: () => void;
  const work = startJobWork(fixture.member, 1, 'tailoring', () => new Promise<void>(resolve => { finish = resolve; }));
  expect(() => deleteJob(fixture.member, 1)).toThrow(/processing/);
  expect(getJob(fixture.member, 1)).not.toBeNull();
  finish(); await work;
  deleteJob(fixture.member, 1);
  expect(getJob(fixture.member, 1)).toBeNull();
});
