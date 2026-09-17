type FileAccess = {
  locked_for_user?: unknown;
  locked?: unknown;
  published?: unknown;
};

/**
 * File visibility is not download permission: hidden/hidden_for_user can describe
 * a link-only file. Canvas computes its download URL from locked_for? separately.
 * https://github.com/instructure/canvas-lms/blob/master/lib/api/v1/attachment.rb
 * This is only a preflight check; the authenticated Canvas download still decides access.
 */
export function canvasFileAccessProblem(file: FileAccess): string | undefined {
  if (file.locked_for_user === true)
    return 'Canvas 标记当前账号无法读取该附件（locked_for_user=true）。';
  // An explicit user-specific permission takes precedence over the general lock
  // (for example, a teacher may read a file that is locked for students).
  if (file.locked_for_user === false) return undefined;
  if (file.locked === true)
    return 'Canvas 标记该附件已锁定（locked=true），且未明确允许当前账号读取。';
  if (file.published === false)
    return 'Canvas 标记该附件尚未发布（published=false），且未明确允许当前账号读取。';
  return undefined;
}
