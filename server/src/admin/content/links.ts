/** The page of a variant: its content's, with the variant unfolded; the variant alone when not grouped yet. */
export const contentLink = (contentId: number | null, itemId: number) =>
  contentId ? `/admin/content/${contentId}?v=${itemId}#variant-${itemId}` : `/admin/item/${itemId}`;

/** The app's cards carry the content key: `/admin/content/k/<key>` finds its page. */
export const contentKeyLink = (key: string) => `/admin/content/k/${encodeURIComponent(key)}`;
