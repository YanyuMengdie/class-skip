import { describe, it, expect } from 'vitest';
import { activeLibraryItems, archiveRoots, archiveBatchTargets, isArchived, restoreArchiveIds } from './archive';
import { recentStudyPdfs } from '../reader/quickStudy';
import { recentPdfs } from '../littleReading/model';
import type { CloudSession } from '@/types';
const row = (id: string, type: 'file' | 'folder', parentId: string | null = null, archived = false): CloudSession =>
  ({ id, type, parentId, archived, fileName: `${id}.pdf`, fileUrl: 'saved-url', userId: 'alice', createdAt: 1 });
describe('library archive hierarchy', () => {
  it('hides nested contents without rewriting them and preserves independent flags on restore', () => {
    const root = row('course', 'folder', null, true), child = row('week', 'folder', root.id);
    const lecture = row('lecture', 'file', child.id), privateArchive = row('old', 'file', child.id, true);
    const items = [root, child, lecture, privateArchive, row('current', 'file')];
    expect(activeLibraryItems(items).map(i => i.id)).toEqual(['current']);
    expect(archiveRoots(items).map(i => i.id)).toEqual(['course']);
    expect(restoreArchiveIds(lecture, items)).toEqual(['course']);
    const restored = items.map(item => item.id === root.id ? { ...item, archived: false } : item);
    expect(activeLibraryItems(restored).map(i => i.id)).toEqual(['course', 'week', 'lecture', 'current']);
    expect(archiveRoots(restored).map(i => i.id)).toEqual(['old']);
    expect(lecture.archived).toBe(false);
    expect(lecture.parentId).toBe('week');
  });
  it('resolves all explicitly archived ancestors for a nested restore', () => {
    const items = [row('a', 'folder', null, true), row('b', 'folder', 'a', true), row('c', 'file', 'b', true)];
    expect(restoreArchiveIds(items[2], items)).toEqual(['c', 'b', 'a']);
  });
  it('does not create child archive flags when a folder and its contents are selected together', () => {
    const items = [row('a', 'folder'), row('b', 'folder', 'a'), row('c', 'file', 'b'), row('d', 'file')];
    expect([...archiveBatchTargets(['c', 'a', 'b', 'd', 'c'], items)]).toEqual([['c', 'a'], ['a', 'a'], ['b', 'a'], ['d', 'd']]);
  });
  it('tolerates legacy missing folders and cyclic ancestors without swallowing unrelated material', () => {
    const items = [row('a', 'folder', 'b'), row('b', 'folder', 'a'), row('missing', 'file', 'gone')];
    expect(activeLibraryItems(items)).toHaveLength(3);
    expect(isArchived(items[0], items)).toBe(false);
    expect(restoreArchiveIds(items[0], items)).toEqual([]);
  });
  it('excludes folder-inherited archives before computing the recent upload window in both recommendations', () => {
    const items = [row('old-course', 'folder', null, true), ...Array.from({ length: 12 }, (_, i) => ({ ...row(`pdf${i}`, 'file', i > 8 ? 'old-course' : null), createdAt: i }))];
    expect(recentStudyPdfs(items).map(i => i.id)).toEqual(['pdf8','pdf7','pdf6','pdf5','pdf4','pdf3','pdf2','pdf1','pdf0']);
    expect(recentPdfs(items).map(i => i.id)).toEqual(recentStudyPdfs(items).map(i => i.id));
    // Legacy PDFs lacking the optional archive field are still visible.
    expect(recentStudyPdfs([{ ...row('legacy', 'file'), archived: undefined }])).toHaveLength(1);
  });
});
