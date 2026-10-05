import { AllPartProps } from "../../interfaces/unit";
import { cls, preColor, preset } from "../../styles";

export const modalStyle = (props: any = {}): Partial<AllPartProps>[] => {
  return [{
    node: cls`
      display: flex;
      flex-direction: column;
      flex-wrap: nowrap;
      background-color: ${preColor.white};
      ${preset.shadow.basic};
      ${preset.radius['4']};
    `,
    head: cls`
      padding: 12px 18px;
      flex-basis: 40px;
      flex-grow: 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 700;
      color: ${preColor.text};
    `,
    extra: cls`
      position: absolute;
      top: 0;
      right: 0;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    `,
    body: cls`
      flex-grow: 1;
      overflow-y: auto;
      color: ${preColor.text};
    `,
    child: cls`
      padding: 0px 24px
    `,
    foot: cls`
      padding: 12px
    `,
  }];
}