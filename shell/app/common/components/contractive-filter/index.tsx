// Copyright (c) 2021 Terminus, Inc.
//
// This program is free software: you can use, redistribute, and/or modify
// it under the terms of the GNU Affero General Public License, version 3
// or later ("AGPL"), as published by the Free Software Foundation.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import React from 'react';
import { Checkbox, DatePicker, Dropdown, Input, Menu, message, Tooltip } from 'antd';
import { Duration, ErdaIcon, Icon as CustomIcon, MemberSelector } from 'common';
import { firstCharToUpper } from 'common/utils';
import moment, { Moment } from 'moment';
import { useEffectOnce, useUpdateEffect } from 'react-use';
import { debounce, has, isArray, isEmpty, isNumber, isString, map, max, sortBy } from 'lodash';
import i18n from 'i18n';
import './index.scss';
import { transformDuration } from 'common/components/duration';

interface Option {
  label: string;
  value: string | number;
  icon?: string | JSX.Element;
  children?: Option[];
}

type ConditionType = 'select' | 'input' | 'dateRange' | 'rangePicker' | 'memberSelector' | 'timespanRange';
const { RangePicker } = DatePicker;

interface IBaseCondition<T> {
  key: string;
  label: string;
  type: T;
  disabled?: boolean;
  split?: boolean;
  value?: string | number | string[] | number[] | Obj;
  fixed?: boolean;
  showIndex?: number; // 0： 隐藏、其他显示
  placeholder?: string;
}

interface ISelectCondition<T> extends IBaseCondition<T> {
  options: Option[];
  tips?: string;
  firstShowLength?: number;
  haveFilter?: boolean;
  required?: boolean;
  emptyText?: string;
  customProps?: Obj;
  quickSelect?: {
    label: string;
    operationKey: string;
  };
  quickAdd?: {
    operationKey: string;
    show: boolean;
    placeholder?: string;
  };
  quickDelete?: {
    operationKey: string;
  };
}

type IInputCondition<T> = IBaseCondition<T>;

interface IDateRangeCondition<T> extends IBaseCondition<T> {
  tips?: string;
  required?: boolean;
  customProps?: Obj;
}
interface IRangePickerCondition<T> extends IBaseCondition<T> {
  tips?: string;
  customProps?: Obj;
}
interface ITimespanRangeCondition<T> extends IBaseCondition<T> {
  tips?: string;
}
interface IMemberSelectorCondition<T> extends IBaseCondition<T> {
  tips?: string;
  emptyText?: string;
  haveFilter?: boolean;
  required?: boolean;
  customProps?: Obj;
}
interface ICustomCondition<T extends any> extends IBaseCondition<T> {
  getComp?: (props: Obj) => React.ReactNode;
}

export type ICondition<T> = T extends 'select'
  ? ISelectCondition<T>
  : T extends 'input'
  ? IInputCondition<T>
  : T extends 'dateRange'
  ? IDateRangeCondition<T>
  : T extends 'rangePicker'
  ? IRangePickerCondition<T>
  : T extends 'timespanRange'
  ? ITimespanRangeCondition<T>
  : T extends 'memberSelector'
  ? IMemberSelectorCondition<T>
  : ICustomCondition<T>;

interface IFilterItemProps<T> {
  itemData: ICondition<T>;
  value: any;
  active: boolean;

  onVisibleChange: (visible: boolean) => void;
  onChange: (data: { key: string; value: any }, extra?: { forceChange?: boolean }) => void;
  onQuickOperation: (data: { key: string; value: any }) => void;
}

const filterMatch = (v: string, f: string) => v.toLowerCase().includes(f.toLowerCase());

export const getSelectOptions = (options: Option[], filterKey: string) => {
  if (!filterKey) return options;
  const useableOptions: Option[] = [];

  options.forEach((item) => {
    let curOp: Option | null = null;
    if (has(item, 'children')) {
      curOp = { ...item, children: [] };
      item.children?.forEach((cItem) => {
        if (filterMatch(`${cItem.label}`, filterKey)) {
          curOp?.children?.push(cItem);
        }
      });
      if (curOp.children?.length) useableOptions.push(curOp);
    } else if (filterMatch(`${item.label}`, filterKey)) {
      curOp = item;
      curOp && useableOptions.push(curOp);
    }
  });
  return useableOptions;
};

interface IOptionItemProps {
  value: Array<string | number>;
  option: Option;
  onClick: (option: Option) => void;
  onDelete?: (option: Option) => void;
}

const OptionItem = (props: IOptionItemProps) => {
  const { value, option, onClick, onDelete } = props;

  return (
    <div
      className={`relative option-item ${(value || []).includes(option.value) ? 'checked-item' : ''}`}
      key={option.value}
      onClick={() => onClick(option)}
    >
      <div className="flex justify-between items-center w-full">
        <span className="flex-h-center">
          {option.icon && <CustomIcon type={option.icon} />}
          {option.label}
        </span>
        <span>
          {value.includes(option.value) ? <ErdaIcon type="check" size="14" color="green" className="ml-2" /> : null}
        </span>
      </div>
      {onDelete ? (
        <div
          className="absolute option-item-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(option);
          }}
        >
          <div className="option-item-delete-box pl-2">
            <ErdaIcon type="shanchu" className="mr-1" size="14" />
          </div>
        </div>
      ) : null}
    </div>
  );
};

const FilterItem = <T extends ConditionType>(props: IFilterItemProps<T>) => {
  const { itemData, value, active, onVisibleChange, onChange, onQuickOperation } = props;
  const { key, label, type } = itemData;
  if (type === 'input') {
    return <InputFilterItem {...(props as IFilterItemProps<'input'>)} />;
  }

  const labels = (
    <span className="text-desc mr-0.5 flex-all-center">
      {firstCharToUpper(label)}
      {itemData.tips ? (
        <Tooltip title={itemData.tips}>
          <ErdaIcon type="help" className="ml-1" />
        </Tooltip>
      ) : null}
    </span>
  );

  if (type === 'select') {
    return <SelectFilterItem {...(props as IFilterItemProps<'select'>)} labels={labels} />;
  }

  if (type === 'dateRange') {
    return <DateRangeFilterItem {...(props as IFilterItemProps<'dateRange'>)} labels={labels} />;
  }

  if (type === 'rangePicker') {
    return <RangePickerFilterItem {...(props as IFilterItemProps<'rangePicker'>)} labels={labels} />;
  }

  if (type === 'memberSelector') {
    return <MemberSelectorFilterItem {...(props as IFilterItemProps<'memberSelector'>)} labels={labels} />;
  }

  if (type === 'timespanRange') {
    return <TimeSpanFilterItem {...(props as IFilterItemProps<'timespanRange'>)} labels={labels} />;
  }
  if (itemData.getComp) {
    const comp = itemData.getComp({
      onChange: (v) => {
        onChange({ key, value: v });
      },
    });
    return (
      <span className="contractive-filter-item flex items-center">
        {labels}
        {comp}
      </span>
    );
  }
  return null;
};

const InputFilterItem = ({
  itemData,
  value,
  active,
  onVisibleChange,
  onChange,
  onQuickOperation,
}: IFilterItemProps<'input'>) => {
  const { key, placeholder, disabled } = itemData;
  const [inputVal, setInputVal] = React.useState(value);
  const debouncedChange = React.useRef(debounce(onChange, 1000));

  useUpdateEffect(() => {
    setInputVal(value);
  }, [value]);

  useUpdateEffect(() => {
    if (inputVal !== value) {
      debouncedChange?.current({ key, value: inputVal }, { forceChange: true });
    }
  }, [inputVal]);

  return (
    <Input
      value={inputVal}
      disabled={disabled}
      size="small"
      style={{ width: 180 }}
      allowClear
      className="bg-black-06"
      prefix={<ErdaIcon fill="default-3" size="16" type="search" />}
      placeholder={firstCharToUpper(placeholder)}
      onChange={(e) => setInputVal(e.target.value)}
    />
  );
};

const SelectFilterItem = ({
  itemData,
  value,
  active,
  onVisibleChange,
  onChange,
  onQuickOperation,
  labels,
}: Merge<IFilterItemProps<'select'>, { labels: JSX.Element }>) => {
  const {
    key,
    haveFilter,
    firstShowLength = 200,
    placeholder,
    quickSelect,
    disabled,
    quickDelete,
    quickAdd,
    options,
    required,
    customProps,
    emptyText = i18n.t('dop:All'),
  } = itemData;
  const [filterMap, setFilterMap] = React.useState({});
  const [hasMore, setHasMore] = React.useState(
    itemData.firstShowLength ? (options?.length || 0) > firstShowLength : false,
  );
  const _value = value ? (isString(value) || isNumber(value) ? [value] : value) : [];
  const _options = options || [];
  const { mode = 'multiple' } = customProps || {};
  const isSingleMode = mode === 'single';
  const valueText =
    _options
      .reduce((_optArr: Option[], _curOpt: Option) => _optArr.concat(_curOpt.children ?? _curOpt), [])
      .filter((a) => _value.includes(a.value))
      .map((a) => a.label)
      .join(',') || emptyText;

  const filterOptions = getSelectOptions(_options, filterMap[key]);
  const useOptions = hasMore ? filterOptions?.slice(0, firstShowLength) : filterOptions;
  const ops = (
    <Menu>
      {haveFilter && [
        <Menu.Item key="search-item options-item">
          <Input
            autoFocus
            size="small"
            placeholder={firstCharToUpper(placeholder) || i18n.t('Search')}
            prefix={<ErdaIcon size="16" fill="default-3" type="search" />}
            value={filterMap[key]}
            onChange={(e) => {
              const v = e.target.value;
              setFilterMap((prev) => {
                return {
                  ...prev,
                  [key]: v.toLowerCase(),
                };
              });
            }}
          />
        </Menu.Item>,
        <Menu.Divider key="divider1" />,
      ]}
      {!isSingleMode && [
        // 单选模式下不展示已选择n项
        <Menu.Item key="select-info" className="flex justify-between items-center not-select px6 py-0 options-item">
          <span>{i18n.t('{name} items selected', { name: _value.length })}</span>
          {!required ? (
            <span className="fake-link ml-2" onClick={() => onChange({ key, value: undefined })}>
              {i18n.t('common:Clear selected')}
            </span>
          ) : null}
        </Menu.Item>,
        <Menu.Divider key="divider2" />,
      ]}
      {quickSelect && !isEmpty(quickSelect)
        ? [
            <Menu.Item key="quick-select-menu-item options-item">
              <span
                className="fake-link flex justify-between items-center"
                onClick={() => onQuickOperation({ key: quickSelect.operationKey, value: itemData })}
              >
                {quickSelect.label}
              </span>
            </Menu.Item>,
            <Menu.Divider key="divider3" />,
          ]
        : null}
      {quickAdd?.operationKey && quickAdd.show !== false
        ? [
            <Menu.Item key="quick-select-menu-item options-item">
              <QuickSave
                onSave={(v) => onQuickOperation({ key: quickAdd.operationKey, value: v })}
                quickAdd={quickAdd}
                options={options}
              />
            </Menu.Item>,
            <Menu.Divider key="divider4" />,
          ]
        : null}
      <Menu.Item key="options" className="p-0 options-container options-item block">
        {useOptions.map((op) => {
          if (has(op, 'children') && !op.children?.length) {
            return null;
          }
          const isGroup = op.children?.length;
          const onClickOptItem = (_curOpt: Option) => {
            if (isSingleMode) {
              if (required && _value.includes(_curOpt.value)) return;
              onChange({
                key,
                value: _value.includes(_curOpt.value) ? undefined : _curOpt.value,
              });
              onVisibleChange(false);
            } else {
              const newVal = _value.includes(_curOpt.value)
                ? _value.filter((v: string | number) => v !== _curOpt.value)
                : _value.concat(_curOpt.value);
              if (required && !newVal.length) return;
              onChange({
                key,
                value: newVal,
              });
            }
          };
          const onDelete = quickDelete?.operationKey
            ? (optItem: Option) => {
                onQuickOperation({ key: quickDelete.operationKey, value: optItem.value });
              }
            : undefined;

          if (isGroup) {
            return (
              <GroupOpt
                key={op.value || op.label}
                value={_value}
                firstShowLength={firstShowLength}
                onDelete={onDelete}
                onClickOptItem={onClickOptItem}
                option={op}
              />
            );
          } else {
            return (
              <OptionItem
                onDelete={onDelete}
                key={op.value}
                value={_value}
                option={op}
                onClick={() => onClickOptItem(op)}
              />
            );
          }
        })}
        {hasMore ? (
          <div className="fake-link hover-active py-1 pl-3  load-more" onClick={() => setHasMore(false)}>
            {`${i18n.t('load more')}...`}
          </div>
        ) : null}
      </Menu.Item>
    </Menu>
  );
  return (
    <Dropdown
      trigger={['click']}
      visible={active}
      onVisibleChange={onVisibleChange}
      overlay={ops}
      disabled={disabled}
      overlayClassName="contractive-filter-item-dropdown"
      placement="bottomLeft"
    >
      <span className={`contractive-filter-item ${disabled ? 'not-allowed' : ''}`}>
        {labels}
        <span className="contractive-filter-item-value nowrap">{valueText}</span>
        <ErdaIcon type="caret-down" className="hover" size="16" />
      </span>
    </Dropdown>
  );
};

const DateRangeFilterItem = ({
  itemData,
  value,
  active,
  onVisibleChange,
  onChange,
  onQuickOperation,
  labels,
}: Merge<IFilterItemProps<'dateRange'>, { labels: JSX.Element }>) => {
  const { key, label, type, placeholder, disabled, required, customProps } = itemData;
  const [_startDate, _endDate] = value || [];
  const startDate = typeof _startDate === 'string' ? +_startDate : _startDate;
  const endDate = typeof _endDate === 'string' ? +_endDate : _endDate;
  const { borderTime } = customProps || {};

  const disabledDate = (isStart: boolean) => (current: Moment | undefined) => {
    return (
      !!current &&
      (isStart
        ? endDate
          ? (borderTime ? current.startOf('dates') : current) > moment(endDate)
          : false
        : startDate
        ? (borderTime ? current.endOf('dates') : current) < moment(startDate)
        : false)
    );
  };

  const getTimeValue = (v: any[]) => {
    if (borderTime) {
      const startVal = v[0]
        ? moment(isString(v[0]) ? +v[0] : v[0])
            .startOf('dates')
            .valueOf()
        : v[0];
      const endVal = v[1]
        ? moment(isString(v[1]) ? +v[1] : v[1])
            .endOf('dates')
            .valueOf()
        : v[1];
      return [startVal, endVal];
    }
    return v;
  };

  return (
    <span className="contractive-filter-item contractive-filter-date-picker">
      {labels}
      <DatePicker
        size="small"
        bordered={false}
        disabled={disabled}
        value={startDate ? moment(startDate) : undefined}
        disabledDate={disabledDate(true)}
        format={'YYYY/MM/DD'}
        allowClear={!required}
        onChange={(v) => onChange({ key, value: getTimeValue([v?.valueOf(), endDate]) })}
        placeholder={i18n.t('common:Start date')}
      />
      <span className="text-desc">{i18n.t('common:to')}</span>
      <DatePicker
        size="small"
        bordered={false}
        disabled={disabled}
        allowClear={!required}
        value={endDate ? moment(endDate) : undefined}
        disabledDate={disabledDate(false)}
        format={'YYYY/MM/DD'}
        placeholder={i18n.t('common:End date')}
        onChange={(v) => onChange({ key, value: getTimeValue([startDate, v?.valueOf()]) })}
      />
    </span>
  );
};

const RangePickerFilterItem = ({
  itemData,
  value,
  active,
  onVisibleChange,
  onChange,
  onQuickOperation,
  labels,
}: Merge<IFilterItemProps<'rangePicker'>, { labels: JSX.Element }>) => {
  const { key, label, type, placeholder, disabled, customProps } = itemData;
  const { ranges, borderTime, selectableTime, ...customRest } = customProps;
  const valueConvert = (val: number[] | Moment[]) => {
    const convertItem = (v: number | Moment) => {
      if (moment.isMoment(v)) {
        return moment(v).valueOf();
      } else {
        return v && moment(v);
      }
    };
    return Array.isArray(val) ? val.map((vItem) => convertItem(vItem)) : convertItem(val);
  };

  /**
   * support object type for i18n
   * {
      LastWeek: {
      label: '近一周' | 'Last Week',
    range: []
      }
    }
    * @param _ranges
    * @returns
    */
  const rangeConvert = (_ranges?: Obj<number[]> | Obj<{ label: string; range: number[] }>) => {
    const reRanges = {};
    map(_ranges, (v, k) => {
      let _k = k;
      let _v = v;
      if (!Array.isArray(v)) {
        _k = v.label;
        _v = v.range;
      }
      reRanges[_k] = valueConvert(_v as number[]);
    });
    return reRanges;
  };
  const disabledDate = (_current: Moment) => {
    return (
      _current &&
      !(
        (selectableTime[0] ? _current > moment(selectableTime[0]) : true) &&
        (selectableTime[1] ? _current < moment(selectableTime[1]) : true)
      )
    );
  };
  return (
    <span className="contractive-filter-item contractive-filter-date-picker">
      {labels}
      <RangePicker
        value={valueConvert(value)}
        ranges={rangeConvert(ranges)}
        size="small"
        disabled={disabled}
        bordered={false}
        disabledDate={selectableTime ? disabledDate : undefined}
        onChange={(v) => {
          const val =
            borderTime && Array.isArray(v)
              ? v.map((vItem, idx) => {
                  if (idx === 0 && vItem) {
                    return vItem.startOf('dates');
                  } else if (idx === 1 && vItem) {
                    return vItem.endOf('dates');
                  }
                  return vItem;
                })
              : v;
          onChange({ key, value: valueConvert(val) });
        }}
        {...customRest}
      />
    </span>
  );
};

const MemberSelectorFilterItem = ({
  itemData,
  value,
  active,
  onVisibleChange,
  onChange,
  onQuickOperation,
  labels,
}: Merge<IFilterItemProps<'memberSelector'>, { labels: JSX.Element }>) => {
  const {
    key,
    label,
    haveFilter,
    placeholder,
    disabled,
    required,
    customProps,
    emptyText = i18n.t('dop:All'),
  } = itemData;
  const memberSelectorRef = React.useRef(null as any);

  React.useEffect(() => {
    if (memberSelectorRef?.current?.show && active) {
      memberSelectorRef.current.show(active);
    }
  }, [active]);
  const memberResultsRender = (displayValue: any[]) => {
    const usersText = map(displayValue, (d) => d.label || d.value).join(',');
    return (
      <span
        className="contractive-filter-item-value nowrap member-value"
        onClick={(e) => {
          e.stopPropagation();
          onVisibleChange(true);
        }}
      >
        {usersText}
      </span>
    );
  };
  return (
    <span
      className="contractive-filter-item"
      onClick={() => {
        onVisibleChange(true);
      }}
    >
      {labels}
      <MemberSelector
        {...((customProps || {}) as any)}
        onChange={(v) => {
          onChange({ key, value: v });
        }}
        allowClear={!required}
        value={value}
        dropdownMatchSelectWidth={false}
        onDropdownVisible={(vis: boolean) => onVisibleChange(vis)}
        ref={memberSelectorRef}
        resultsRender={memberResultsRender}
        placeholder={' '}
        className="contractive-member-selector"
        showSearch={haveFilter}
      />
      {value?.length ? null : <span>{emptyText}</span>}
      <ErdaIcon type="caret-down" className="hover" size="16" />
    </span>
  );
};

const TimeSpanFilterItem = ({
  itemData,
  value,
  active,
  onVisibleChange,
  onChange,
  onQuickOperation,
  labels,
}: Merge<IFilterItemProps<'timespanRange'>, { labels: JSX.Element }>) => {
  const [duration, setDuration] = React.useState();
  useEffectOnce(() => {
    setDuration(value);
  });

  const { key, label, placeholder, disabled } = itemData;
  return (
    <span className="contractive-filter-item">
      {labels}
      <Duration
        value={duration}
        onChange={(v) => {
          const durationMin = transformDuration(v?.[0]);
          const durationMax = transformDuration(v?.[1]);
          if (isNumber(durationMin) && isNumber(durationMax)) {
            if (durationMin <= durationMax) {
              onChange({ key, value: v });
            } else {
              message.error(i18n.t('msp:wrong duration'));
            }
          } else if (!isNumber(durationMin) && !isNumber(durationMax)) {
            onChange({ key, value: [] });
          }
        }}
      />
    </span>
  );
};
interface IQuickSaveProps {
  onSave: (val: string) => void;
  options?: Option[];
  quickAdd?: { placeholder?: string };
}

const QuickSave = (props: IQuickSaveProps) => {
  const { onSave, options, quickAdd } = props;
  const [v, setV] = React.useState('');
  const [tip, setTip] = React.useState(`${i18n.t('can not be empty')}`);

  useUpdateEffect(() => {
    const labels = map(options, 'label') || [];
    if (!v) {
      setTip(i18n.t('can not be empty'));
    } else if (labels.includes(v)) {
      setTip(`${i18n.t('{name} already exists', { name: i18n.t('Name') })}`);
    } else {
      setTip('');
    }
  }, [v]);

  const save = () => {
    !tip && onSave(v);
    setV('');
  };
  return (
    <div className="flex justify-between items-center">
      <Input
        size="small"
        placeholder={firstCharToUpper(quickAdd?.placeholder) || i18n.t('Please enter')}
        value={v}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV(e.target.value)}
      />
      <Tooltip title={tip}>
        <span className={`ml-2 ${!tip ? 'fake-link' : 'not-allowed'}`} onClick={save}>
          {i18n.t('Save')}
        </span>
      </Tooltip>
    </div>
  );
};

interface IGroupOptProps {
  value: Array<string | number>;
  option: Option;
  firstShowLength?: number;
  onClickOptItem: (option: Option) => void;
  onDelete?: (option: Option) => void;
}

const GroupOpt = (props: IGroupOptProps) => {
  const { option, onClickOptItem, value, onDelete, firstShowLength } = props;
  const [expand, setExpand] = React.useState(true);
  const [hasMore, setHasMore] = React.useState(
    firstShowLength ? (option.children?.length || 0) > firstShowLength : false,
  );

  const useOption = hasMore ? option.children?.slice(0, firstShowLength) : option.children;

  return (
    <div className={'option-group'}>
      <div className="option-group-label flex items-center justify-between" onClick={() => setExpand(!expand)}>
        <div className="flex items-center">
          {option.icon && <CustomIcon type={option.icon} />}
          {option.label}
        </div>
        <ErdaIcon type="down" className={`expand-icon flex items-center ${expand ? 'expand' : ''}`} size="16" />
      </div>
      <div className={`option-group-content ${expand ? '' : 'no-expand'}`}>
        {useOption?.map((cItem) => {
          return (
            <OptionItem
              onDelete={onDelete}
              key={cItem.value}
              value={value}
              option={cItem}
              onClick={() => onClickOptItem(cItem)}
            />
          );
        })}
        {hasMore ? (
          <div className="fake-link hover-active py-1 pl-8  load-more" onClick={() => setHasMore(false)}>
            {`${i18n.t('load more')}...`}
          </div>
        ) : null}
      </div>
    </div>
  );
};
const noop = () => {};

interface ContractiveFilterProps<T extends ConditionType> {
  initValue?: Obj; // 初始化
  values?: Obj; // 完全受控
  conditions: Array<ICondition<T>>;
  delay: number;
  fullWidth?: boolean;
  className?: string;
  onConditionsChange?: (data: Array<ICondition<T>>) => void;
  onChange: (valueMap: Obj, key?: string) => void;
  onQuickOperation?: (data: { key: string; value: any }) => void;
}

const setConditionShowIndex = <T extends ConditionType>(
  conditions: Array<ICondition<T>>,
  key: string,
  show: boolean,
) => {
  const showIndexArr = map(conditions, 'showIndex');
  const maxShowIndex = max(showIndexArr) as number;
  return map(conditions, (item) => {
    return {
      ...item,
      showIndex: key === item.key ? (show ? (maxShowIndex || 0) + 1 : 0) : item.showIndex,
    };
  });
};

const getInitConditions = <T extends ConditionType>(conditions: Array<ICondition<T>>, valueMap: Obj) => {
  const showIndexArr = map(conditions, 'showIndex');
  const maxShowIndex = max(showIndexArr) as number;
  let curMax = maxShowIndex;
  const reConditions = map(conditions, (item) => {
    const curValue = valueMap[item.key];
    // 有值默认展示
    if ((!has(item, 'showIndex') && curValue !== undefined) || (isArray(curValue) && !isEmpty(curValue))) {
      curMax += 1;
      return { ...item, showIndex: curMax };
    }
    return { ...item };
  });
  return reConditions;
};

const ContractiveFilter = <T extends ConditionType>({
  initValue,
  values,
  conditions: propsConditions,
  delay,
  onChange,
  onQuickOperation = noop,
  onConditionsChange = noop,
  fullWidth = false,
  className,
}: ContractiveFilterProps<T>) => {
  const [conditions, setConditions] = React.useState(
    getInitConditions(propsConditions || [], values || initValue || {}),
  );
  const [hideFilterKey, setHideFilterKey] = React.useState('');
  const [closeAll, setCloseAll] = React.useState(false);
  const [valueMap, setValueMap] = React.useState(values || initValue || {});
  const [activeMap, setActiveMap] = React.useState({});
  const debouncedChange = React.useRef(debounce(onChange, delay));

  const valueMapRef = React.useRef<Obj>();
  const inputList = conditions.filter((a) => a.type === 'input' && a.fixed !== false);
  const mainList = conditions.filter((a) => a.split);
  const displayConditionsLen = conditions.filter(
    (item) => (!item.fixed && item.type !== 'input' && !item.split) || (item.fixed === false && item.type === 'input'),
  ).length;

  useUpdateEffect(() => {
    setValueMap(values || {});
  }, [values]);

  React.useEffect(() => {
    valueMapRef.current = { ...valueMap };
  }, [valueMap]);

  // 当从props传进来的conditions变化时调用setConditions
  React.useEffect(() => {
    const preShowIndexMap = conditions.reduce((acc, x) => ({ ...acc, [x.key]: x.showIndex }), {});
    // 记录已选中的标签项，保留已选中标签项的showIndex
    const keepShowIndexConditions =
      propsConditions?.map((item) => ({
        ...item,
        showIndex: preShowIndexMap[item.key] || item.showIndex,
      })) || [];

    setConditions(keepShowIndexConditions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsConditions]);

  React.useEffect(() => {
    onConditionsChange(conditions);
  }, [conditions, onConditionsChange]);

  React.useEffect(() => {
    // 控制点击外部关闭 dropdown
    const handleCloseDropdown = (e: MouseEvent) => {
      const wrappers = Array.from(document.querySelectorAll('.contractive-filter-item-wrap'));
      const dropdowns = Array.from(document.querySelectorAll('.contractive-filter-item-dropdown'));

      const datePickers = Array.from(document.querySelectorAll('.contractive-filter-date-picker'));
      const node = e.target as Node;
      const inner = wrappers.concat(dropdowns).some((wrap) => wrap.contains(node));
      const isDatePicker = datePickers.some((wrap) => wrap.contains(node));

      if (!inner && isDatePicker) {
        setCloseAll(true);
      }
    };
    document.body.addEventListener('click', handleCloseDropdown);
    return () => document.body.removeEventListener('click', handleCloseDropdown);
  }, []);

  const handelItemChange = (
    newValueMap: { key: string; value: any } | Obj,
    extra?: { batchChange?: boolean; forceChange?: boolean },
  ) => {
    const { batchChange = false, forceChange = false } = extra || {};
    let curValueMap = valueMapRef.current;
    if (batchChange) {
      setValueMap((prev) => {
        return {
          ...prev,
          ...newValueMap,
        };
      });
      curValueMap = { ...curValueMap, ...newValueMap };
    } else {
      const { key, value } = newValueMap;
      setValueMap((prev) => {
        return {
          ...prev,
          [key]: value,
        };
      });
      curValueMap = { ...curValueMap, [key]: value };
    }
    if (delay && !forceChange) {
      debouncedChange.current(curValueMap, newValueMap?.key);
    } else {
      onChange(curValueMap, newValueMap?.key);
    }
  };

  // 清除选中
  const handleClearSelected = () => {
    setConditions((prev) =>
      map(prev, (pItem) => {
        if (pItem.fixed || (pItem.type === 'input' && pItem.fixed !== false)) {
          return { ...pItem };
        } else {
          return { ...pItem, showIndex: 0 };
        }
      }),
    );
    const newValueMap = { ...valueMap };
    map(newValueMap, (_v, _k) => {
      const curConditions = conditions[_k] || {};
      if (!(curConditions.fixed || (curConditions.type === 'input' && curConditions.fixed !== false))) {
        newValueMap[_k] = initValue?.[_k] ?? undefined;
      }
    });
    handelItemChange(newValueMap, { batchChange: true });
  };

  const showList = sortBy(
    conditions.filter((a) => {
      if (a.split) {
        return false;
      }
      const curValue = valueMap[a.key];
      // 有值默认展示
      if (a.type !== 'input' && (curValue !== undefined || (isArray(curValue) && !isEmpty(curValue)))) {
        return true;
      }

      let flag = false;
      if (a.type !== 'input') {
        flag = !!a.showIndex || !!a.fixed;
      } else {
        flag = !!a.showIndex && a.fixed === false;
      }
      return flag;
    }),
    'showIndex',
  );

  return (
    <div className={`contractive-filter-bar ${className || ''}`}>
      {[...mainList, ...inputList, ...showList].map((item) => (
        <span
          className={`contractive-filter-item-wrap ${fullWidth ? 'w-full' : ''}`}
          key={item.key}
          onClick={() => {
            setCloseAll(false);
          }}
        >
          {!item.fixed && item.type !== 'input' && (
            <ErdaIcon
              fill="gray"
              color="gray"
              className="contractive-filter-item-close"
              type="guanbi-fill"
              size="16"
              onClick={() => {
                setConditions(setConditionShowIndex(conditions, item.key, false));
                if (valueMap[item.key] !== undefined) handelItemChange({ key: item.key, value: undefined });
              }}
            />
          )}
          <FilterItem
            itemData={item}
            value={valueMap[item.key]}
            active={closeAll ? false : activeMap[item.key]}
            onVisibleChange={(v) => setActiveMap((prev) => ({ ...prev, [item.key]: v }))}
            onChange={handelItemChange}
            onQuickOperation={onQuickOperation}
          />
          {item.split ? <div className="ml-1 contractive-filter-split mr-1" /> : null}
        </span>
      ))}

      {displayConditionsLen > 0 && (
        <span className={`contractive-filter-item-wrap ${fullWidth ? 'w-full' : ''}`}>
          <Dropdown
            trigger={['click']}
            overlayClassName="contractive-filter-item-dropdown"
            overlay={
              <Menu>
                <Menu.Item className="not-select">
                  <Input
                    autoFocus
                    size="small"
                    prefix={<ErdaIcon size="16" fill="default-3" type="search" />}
                    onClick={(e) => e.stopPropagation()}
                    value={hideFilterKey}
                    onChange={(e) => setHideFilterKey(e.target.value.toLowerCase())}
                    placeholder={i18n.t('common:Filter conditions')}
                  />
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item className="not-select px6 py-0">
                  <div className="flex justify-between items-center">
                    <span>
                      {i18n.t('{name} items selected', { name: showList.filter((a) => a.fixed !== true).length })}
                    </span>
                    <span className="fake-link" onClick={handleClearSelected}>
                      {i18n.t('common:Clear selected')}
                    </span>
                  </div>
                </Menu.Item>
                <Menu.Divider />
                {conditions.map((item) => {
                  const { key, label, fixed, type } = item;
                  if (
                    fixed ||
                    (type === 'input' && fixed !== false) ||
                    (item.label && !item.label.toLowerCase().includes(hideFilterKey))
                  ) {
                    return null;
                  }
                  const handleClick = () => {
                    const haveShow = !!showList.find((a) => a.key === key);
                    setConditions(setConditionShowIndex(conditions, item.key, !haveShow));
                    if (!haveShow) {
                      setCloseAll(false);
                      setActiveMap((prev) => ({ ...prev, [item.key]: true }));
                    }
                  };
                  return (
                    <Menu.Item key={key} className="option-item" onClick={handleClick}>
                      <Checkbox checked={!!showList.find((a) => a.key === key)} className="mr-2" />
                      {firstCharToUpper(label)}
                    </Menu.Item>
                  );
                })}
              </Menu>
            }
            placement="bottomLeft"
          >
            <span className="contractive-filter-item more-conditions">
              <ErdaIcon color="black-8" type="plus" className="mr-0.5 color-text" />
              <span>{i18n.t('Filter')}</span>
              <ErdaIcon type="caret-down" className="hover" size="16" />
            </span>
          </Dropdown>
        </span>
      )}
    </div>
  );
};

export default ContractiveFilter;
