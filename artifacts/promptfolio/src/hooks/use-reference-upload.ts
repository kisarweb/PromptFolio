import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { uploadReference, getListReferencesQueryKey, getGetReferenceStatsQueryKey, type ReferenceImage } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';
import { MAX_UPLOAD_BYTES, fileToDataUrl } from '@/lib/references';

/** Uploads image files (picked, dropped or pasted) to the brand reference library. */
export function useReferenceUpload() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(0);

  const upload = async (files: File[], source: 'upload' | 'paste'): Promise<ReferenceImage[]> => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length < files.length) toast({ variant: 'destructive', title: t('references.onlyImages') });
    const out: ReferenceImage[] = [];
    setPending((n) => n + images.length);
    for (const file of images) {
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(t('references.tooLarge'));
        const data = await fileToDataUrl(file);
        const filename = file.name && file.name !== 'image.png' ? file.name : null;
        const ref = await uploadReference({ data, filename, source });
        out.push(ref);
        if (ref.deduplicated) toast({ title: t('references.reused', { code: ref.code }) });
      } catch (e) {
        toast({ variant: 'destructive', title: t('references.uploadFailed'), description: apiErrorMessage(e) });
      } finally {
        setPending((n) => n - 1);
      }
    }
    if (out.length) {
      qc.invalidateQueries({ queryKey: getListReferencesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetReferenceStatsQueryKey() });
    }
    return out;
  };

  return { upload, pending };
}
