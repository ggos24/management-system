import { describe, expect, it } from 'vitest';
import { TASK_COMMENT_SELECT } from '../lib/database';

describe('task comment query', () => {
  it('pins the direct author and mention relationships', () => {
    expect(TASK_COMMENT_SELECT).toContain('profiles!task_comments_user_id_fkey');
    expect(TASK_COMMENT_SELECT).toContain('task_comment_mentions!task_comment_mentions_comment_id_fkey');
  });
});
