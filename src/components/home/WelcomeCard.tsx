import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { avatarColor, initials } from '@/lib/utils';
import type { OnboardingContext, SeasonalRoshHashanah } from '@/lib/lifecycle';

// Temporary "welcome to the family" card for a newly-onboarded member.
// Purely derived: the name, photo and season all come from the lifecycle
// record + family tree, so it works for any future family addition and
// disappears on its own (dismissed, or once its window passes).

interface WelcomeCardProps {
  context: OnboardingContext;
  /** Present only during the member's first Rosh Hashanah with the family. */
  seasonal: SeasonalRoshHashanah | null;
  onDismiss: () => void;
}

export function WelcomeCard({ context, seasonal, onDismiss }: WelcomeCardProps) {
  const reduceMotion = useReducedMotion();
  const { member, memberFirstName, memberGender } = context;
  if (!memberFirstName) return null;

  const fem = memberGender === 'f';
  const title = seasonal
    ? `ראש השנה הראשון של ${memberFirstName} עם המשפחה 🍎❤️`
    : `ברוכ${fem ? 'ה הבאה' : 'ים הבאים'}, ${memberFirstName} ❤️`;
  const body = seasonal
    ? `שנה חדשה, ומשפחה קצת יותר גדולה ✨ ${memberFirstName}, שתהיה לך שנה טובה ומתוקה — ${seasonal.hebrewYearLabel}.`
    : 'אנחנו כל כך שמחים שהצטרפת למשפחה.';

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card padding="sm" className="relative overflow-hidden border-accent/30 bg-accent/5">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="סגירת הודעת הברוכים הבאים"
          className="absolute top-2 left-2 p-1.5 rounded-md text-text-muted hover:text-text-mid hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X size={16} />
        </button>
        <div className="flex items-center gap-3 pe-6">
          <div
            className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0 ring-2 ring-white shadow-card"
            style={{ background: member?.photoData ? undefined : avatarColor(memberFirstName) }}
          >
            {member?.photoData
              ? <img src={member.photoData} alt="" className="w-full h-full object-cover" />
              : initials(memberFirstName)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-primary">{title}</p>
            <p className="text-xs text-text-mid mt-0.5">{body}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
