import { $t } from '@/i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { cover } from '../../engine/helper'
import { isPublic } from '../DbDisk/helper'
import { BackToMyPage } from './BackToMyPage'
import { icons } from '@/components/SvgIcon'
import { isEmpty } from '@/slate-item/utils/isEmpty'
import { showSnack } from '@/slate-item/utils/msg/showSnack'

export function createSandboxAddon({ app, $ }: NewAddonParams) {
  class Sandbox implements IAddon {
    app!: App
    config = {}
    serviceWorkerRegistration: ServiceWorkerRegistration | null = null

    isSandbox() {
      return isPublic()
    }

    addonBeforeRun() {
      if ($.sandbox.isSandbox()) {
        cover($.sync2.addPending, () => false)

        const { post } = $.http
        cover(post, async (uri, ...args) => {
          if (uri.includes('handle-sync')) {
            return false
          }
          return post.call($.http, uri, ...args)
        })
        cover($.dbDisk.save, () => true as any)
      }
    }

    addonRun() {
      if ($.sandbox.isSandbox()) {
        $.statusBar.pushComponent(BackToMyPage, 'center')
      } else {
        if ($.dbDisk.storageMode !== 'sqlite' && location.hostname !== 'localhost' && 'serviceWorker' in navigator) {
        // if (true) {
          let registered = false;
          const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
          if (standalone)
            $.main.addMoreExtraCommands({
              registerNotification: {
                title: $t`Register Notification`,
                icon: icons.svg_alarm,
                order: -1,
                cond: () => (!registered) && standalone,
                onClick: () => {
                  $.sandbox.serviceWorkerRegistration!.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: (window as any).VAPID_PUBLIC,
                  })
                    .then((subscription) => {
                      try {
                        const webPushStr = JSON.stringify(subscription)
                        const oldNotificationKey = $.prefer.getValue('reminderNotificationKey') ?? '';
                        if (!oldNotificationKey.includes(webPushStr)) {
                          if (isEmpty(oldNotificationKey))
                            $.prefer.setValue('reminderNotificationKey', `webpush##${webPushStr}`);
                          else
                            $.prefer.setValue('reminderNotificationKey', `${oldNotificationKey};;webpush##${webPushStr}`);
                        }
                        showSnack({
                          content: $t`Successfully subscribed to push notifications!`,
                          severity: 'success',
                          autoClose: 3000,
                          clickAway: true,
                        })
                        registered = true;
                      } catch (error) {
                        console.log(error)
                        showSnack({
                          content: $t`Failed to subscribe to push notifications!`,
                          severity: 'error',
                          autoClose: 3000,
                          clickAway: true,
                        })
                      }
                    })
                },
              },
            })
          navigator.serviceWorker.getRegistrations().then(registrations => {
            for (const registration of registrations) {
              if (registration.active?.scriptURL?.includes("push.js"))
                registration.unregister(); // 处理烂摊子：把push注册到缓存域了，这不对
            }
          }),
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
              .then(async (registration) => {
                console.log('Service worker registered.');
                $.sandbox.serviceWorkerRegistration = registration;
                Notification.requestPermission();
                registered = !!(await $.sandbox.serviceWorkerRegistration?.pushManager.getSubscription());
              })
              .catch(error => console.error('Error registering service worker:', error)),
            navigator.serviceWorker.addEventListener('message', function (event) {
              if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
                const nodeKy = event.data.nodeKy;

                if (nodeKy) {
                  $.floatViewer.show({ item: nodeKy, isPin: true })
                }
              }
            });
            if ('setAppBadge' in navigator) {
              const clearBadge = () => {
                navigator.setAppBadge(0);
                caches.open("EvergreenNote-v0-swDB").then(e=>e.delete("/used_tags"));
              }
              document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                  clearBadge();
                }
              });
              window.addEventListener('focus', clearBadge);
              clearBadge();
            }
        }
      }
    }
  }

  return { sandbox: new Sandbox() }
}
