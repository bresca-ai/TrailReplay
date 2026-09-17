import { X, Github, Instagram, MessageSquare, Heart, ExternalLink, Shield, FileText, BookOpen, Download, Sparkles, Building2 } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';

interface InfoPanelProps {
  onClose: () => void;
}

export function InfoPanel({ onClose }: InfoPanelProps) {
  const { t } = useI18n();
  return (
    <div className="h-full bg-[var(--canvas)] border-l-2 border-[var(--evergreen)] flex flex-col">
      {/* Header */}
      <div className="h-14 bg-[var(--evergreen)] text-[var(--canvas)] flex items-center justify-between px-4">
        <h2 className="font-bold text-sm">{t('info.title')}</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Copyright */}
        <div className="text-center pb-4 border-b border-[var(--evergreen)]/20">
          <img
            src="/media/images/logo.svg"
            alt="TrailReplay"
            className="h-12 w-12 mx-auto mb-2"
          />
          <p className="text-[var(--evergreen)] font-bold">Trail Replay</p>
          <p className="text-xs text-[var(--evergreen-60)]">
            Open Source Trail Storytelling
          </p>
        </div>

        {/* Tech Stack */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.builtWith')}
          </h3>
          <p className="text-sm text-[var(--evergreen-60)] leading-relaxed">
            {t('info.builtWithBody')}
          </p>
          <a
            href="/acknowledgments"
            className="inline-flex items-center gap-1 text-sm text-[var(--trail-orange)] hover:underline"
          >
            <span>{t('info.acknowledgments')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.learn')}
          </h3>
          <p className="text-sm text-[var(--evergreen-60)]">
            {t('info.learnBody')}
          </p>
          <div className="space-y-2">
            <InfoCard
              href="/tutorial"
              icon={<BookOpen className="w-4 h-4" />}
              label={t('info.tutorial')}
              description={t('info.tutorialDesc')}
            />
            <InfoCard
              href="/gpx-download-guide"
              icon={<Download className="w-4 h-4" />}
              label={t('info.gpxGuide')}
              description={t('info.gpxGuideDesc')}
            />
          </div>
        </div>

        {/* Map Data Sources */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.mapSources')}
          </h3>
          <div className="space-y-3 text-xs text-[var(--evergreen-60)]">
            <div>
              <a href="https://www.esri.com/en-us/arcgis/products/arcgis-online" target="_blank" rel="noopener noreferrer"
                className="font-medium text-[var(--evergreen)] hover:text-[var(--trail-orange)] underline">
                Esri World Imagery & Wayback
              </a>
              {' '}{t('info.esri')}
            </div>
            <div>
              <a href="https://www.opensnowmap.org" target="_blank" rel="noopener noreferrer"
                className="font-medium text-[var(--evergreen)] hover:text-[var(--trail-orange)] underline">
                OpenSnowMap.org
              </a>
              {' '}{t('info.opensnow')}
            </div>
            <div>
              <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer"
                className="font-medium text-[var(--evergreen)] hover:text-[var(--trail-orange)] underline">
                OpenStreetMap
              </a>
              {' '}{t('info.osmContrib')}{' '}
              <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer"
                className="hover:text-[var(--trail-orange)] underline">OpenTopoMap
              </a>
              {' '}{t('info.osmOpenTopo')}{' '}
              <a href="https://carto.com" target="_blank" rel="noopener noreferrer"
                className="hover:text-[var(--trail-orange)] underline">CartoDB
              </a>
              {' '}{t('info.osmLabels')}{' '}
              <a href="https://www.opentopography.org/" target="_blank" rel="noopener noreferrer"
                className="hover:text-[var(--trail-orange)] underline">{t('info.osmOpenTopography')}
              </a>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.connect')}
          </h3>
          <div className="space-y-1">
            <InfoLink
              href="https://github.com/bresca-ai/TrailReplay"
              icon={<Github className="w-4 h-4" />}
              label={t('info.github')}
              external
            />
            <InfoLink
              href="https://www.instagram.com/trailreplay/"
              icon={<Instagram className="w-4 h-4" />}
              label={t('info.instagram')}
              external
            />
            <InfoLink
              href="https://bresca.ai"
              icon={<Building2 className="w-4 h-4" />}
              label={t('info.builtBy')}
              external
            />
          </div>
        </div>

        {/* Support */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.support')}
          </h3>
          <a
            href="https://ko-fi.com/alexalmansa"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('support_clicked', { support_location: 'info_panel' })}
            className="flex items-center gap-2 p-3 bg-[var(--trail-orange)]/10 hover:bg-[var(--trail-orange)]/20 rounded-lg transition-colors group"
          >
            <Heart className="w-5 h-5 text-[var(--trail-orange)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--evergreen)]">{t('info.donateTitle')}</p>
              <p className="text-xs text-[var(--evergreen-60)]">{t('info.donateSubtitle')}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-[var(--evergreen-60)] group-hover:text-[var(--trail-orange)]" />
          </a>
        </div>

        {/* Legal */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.legal')}
          </h3>
          <div className="space-y-1">
            <InfoLink
              href="/privacy"
              icon={<Shield className="w-4 h-4" />}
              label={t('info.privacy')}
            />
            <InfoLink
              href="/terms"
              icon={<FileText className="w-4 h-4" />}
              label={t('info.terms')}
            />
          </div>
        </div>

        {/* Feedback */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.feedback')}
          </h3>
          <a
            href="https://github.com/bresca-ai/TrailReplay/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 bg-[var(--evergreen)]/5 hover:bg-[var(--evergreen)]/10 rounded-lg transition-colors group"
          >
            <MessageSquare className="w-5 h-5 text-[var(--evergreen)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--evergreen)]">{t('info.feedbackTitle')}</p>
              <p className="text-xs text-[var(--evergreen-60)]">{t('info.feedbackSubtitle')}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-[var(--evergreen-60)] group-hover:text-[var(--evergreen)]" />
          </a>
        </div>

        {/* More Tools */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--evergreen)] uppercase tracking-wide">
            {t('info.moreTools')}
          </h3>
          <div className="space-y-1">
            <InfoLink href="/gpx-animation" icon={<Sparkles className="w-4 h-4" />} label={t('info.gpxAnimator')} />
            <InfoLink href="/strava-to-video" icon={<Sparkles className="w-4 h-4" />} label={t('info.stravaToVideo')} />
            <InfoLink href="/garmin-to-video" icon={<Sparkles className="w-4 h-4" />} label={t('info.garminToVideo')} />
            <InfoLink href="/cycling-route-animation" icon={<Sparkles className="w-4 h-4" />} label={t('info.cyclingRouteAnimation')} />
            <InfoLink href="/running-route-animation" icon={<Sparkles className="w-4 h-4" />} label={t('info.runningRouteAnimation')} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--evergreen)]/20 text-center">
        <p className="text-xs text-[var(--evergreen-60)]">
          {t('info.footer')}
        </p>
      </div>
    </div>
  );
}

interface InfoCardProps extends InfoLinkProps {
  description: string;
}

function InfoCard({ href, icon, label, description, external }: InfoCardProps) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={() => {
        if (href === '/tutorial' || href === '/gpx-download-guide') {
          trackEvent('help_cta_clicked', {
            cta_location: 'info_panel',
            target_page: href === '/tutorial' ? 'tutorial' : 'gpx_guide',
          });
        }
      }}
      className="flex items-start gap-3 rounded-xl border border-[var(--evergreen)]/10 bg-[var(--trail-orange)]/6 p-3 transition-colors hover:border-[var(--trail-orange)]/30 hover:bg-[var(--trail-orange)]/10"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--trail-orange)] shadow-sm">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--evergreen)]">
          {label}
          {external && <ExternalLink className="h-3 w-3 text-[var(--evergreen-60)]" />}
        </span>
        <span className="mt-1 block text-xs leading-5 text-[var(--evergreen-60)]">{description}</span>
      </span>
    </a>
  );
}

interface InfoLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}

function InfoLink({ href, icon, label, external }: InfoLinkProps) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-2 p-2 hover:bg-[var(--evergreen)]/5 rounded-lg transition-colors text-[var(--evergreen)] group"
    >
      <span className="text-[var(--evergreen-60)] group-hover:text-[var(--evergreen)]">
        {icon}
      </span>
      <span className="text-sm flex-1">{label}</span>
      {external && (
        <ExternalLink className="w-3 h-3 text-[var(--evergreen-60)] group-hover:text-[var(--evergreen)]" />
      )}
    </a>
  );
}
