import { router } from 'expo-router';
import { useState } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { error as hapticError, success } from '@/lib/haptics';
import { reportReview } from '@/domain/reporting';
import { errorMessage } from '@/lib/utils';

/**
 * The one modal in v1 (DESIGN.md → Lists and modals). Opened by the flag control
 * on any review card (MOD-1). A `Dialog`, not a route, and dismissible at every
 * step without completing the report.
 *
 * Two things it deliberately does not do. It does not remove the review from the
 * screen on submit: moderation is the team flipping `hidden` in the dashboard
 * (MOD-4), so the honest confirmation is "we'll take a look", not a disappearing
 * card that implies the reporter has that power. And it never shows the report
 * queue — reporters have no read path on `reports` at all (MOD-2).
 *
 * Controlled by the parent so a single sheet serves every card on a screen: the
 * parent holds the `reviewId` being reported and clears it to close.
 */

type ReportSheetProps = {
  /** The review under report, or `null` when the sheet is closed. */
  reviewId: string | null;
  onClose: () => void;
};

type Phase = 'form' | 'submitting' | 'done';

export function ReportSheet({ reviewId, onClose }: ReportSheetProps) {
  const open = reviewId !== null;

  const [phase, setPhase] = useState<Phase>('form');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  // Reset when a new report opens, so a previous "done" state or a stale reason
  // never bleeds into the next review's sheet. Adjusting state during render on a
  // changed input is the recommended alternative to an effect here — it resets
  // only on open (not on close, which would flip "done" back to the form mid
  // dismiss), while still tracking every id change so reopening the same review
  // resets too.
  const [prevReviewId, setPrevReviewId] = useState(reviewId);
  if (reviewId !== prevReviewId) {
    setPrevReviewId(reviewId);
    if (reviewId !== null) {
      setPhase('form');
      setReason('');
      setError('');
    }
  }

  async function submit() {
    if (!reviewId) return;
    setPhase('submitting');
    setError('');
    try {
      await reportReview(reviewId, reason);
      success();
      setPhase('done');
    } catch (cause) {
      hapticError();
      setError(errorMessage(cause, "We couldn't file that report."));
      setPhase('form');
    }
  }

  function openContentPolicy() {
    // Close first: navigating out from under an open portal leaves the overlay
    // covering the screen it lands on.
    onClose();
    router.push('/content-policy');
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="gap-4">
        {phase === 'done' ? (
          <>
            <DialogHeader>
              <DialogTitle>Thanks — we&apos;ll take a look</DialogTitle>
              <DialogDescription>
                The review stays up while the team reviews it. Nothing changes on your end.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onPress={onClose}>
                <Text>Done</Text>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report this review</DialogTitle>
              <DialogDescription>
                Reviews must not name or describe identifiable people. Tell us what&apos;s wrong
                — a reason is optional.
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={reason}
              onChangeText={setReason}
              placeholder="What's the problem? (optional)"
              textAlignVertical="top"
              editable={phase !== 'submitting'}
            />

            <Button variant="link" size="sm" className="self-start px-0" onPress={openContentPolicy}>
              <Text>Read the content policy</Text>
            </Button>

            {error ? (
              <Text variant="small" className="text-destructive">
                {error}
              </Text>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={phase === 'submitting'}>
                  <Text>Cancel</Text>
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                onPress={submit}
                disabled={phase === 'submitting'}
                haptic={false}>
                <Text>{phase === 'submitting' ? 'Reporting…' : 'Report'}</Text>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
