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

import { goTo } from 'common/utils';
import iterationStore from 'app/modules/project/stores/iteration';
import { Ellipsis, RadioTabs, TopButtonGroup } from 'common';
import { useUpdate } from 'common/use-hooks';
import { useLoading } from 'core/stores/loading';
import i18n from 'i18n';
import moment from 'moment';
import { Button, Progress, Modal } from 'antd';
import ErdaTable from 'common/components/table';
import React from 'react';
import { map, sumBy } from 'lodash';
import IterationModal from './iteration-modal';
import { WithAuth, usePerm } from 'user/common';
import routeInfoStore from 'core/stores/route';

const options = [
  { value: 'unarchive', label: i18n.t('In Progress') },
  { value: 'archived', label: i18n.t('Archived') },
];

export const Iteration = () => {
  const [status, setStatus] = React.useState('unarchive');
  const [list, paging] = iterationStore.useStore((s) => [s.iterationList, s.iterationPaging]);

  const projectId = routeInfoStore.useStore((s) => s.params.projectId);
  const { getIterations, deleteIteration, editIteration: handleFiledIteration } = iterationStore.effects;
  const [isFetching] = useLoading(iterationStore, ['getIterations']);
  const { total, pageNo, pageSize } = paging;
  const [state, updater] = useUpdate({
    modalVisible: false,
    curDetail: null,
  });

  const query = React.useMemo(() => {
    const iterationStateMap = {
      archived: 'FILED',
      unarchive: 'UNFILED',
    };
    return { state: iterationStateMap[status], pageNo: 1 };
  }, [status]);

  const getList = React.useCallback(
    (q: Obj = {}) => {
      return getIterations({ ...query, ...q, projectID: +projectId });
    },
    [getIterations, query, projectId],
  );

  React.useEffect(() => {
    getList();
  }, [getList]);

  const onDelete = (id: number) => {
    deleteIteration(id).then(() => {
      getList({ pageNo: 1 });
    });
  };

  const onEdit = (item: ITERATION.Detail) => {
    updater.curDetail(item);
    updater.modalVisible(true);
  };

  const onFiled = (record: ITERATION.Detail, operation: string) => {
    const { id, startedAt, finishedAt, title, content } = record;
    handleFiledIteration({
      id,
      startedAt,
      finishedAt,
      title,
      content,
      state: operation,
    }).then(() => {
      getList({ pageNo: 1 });
    });
  };

  const onCreate = () => {
    updater.modalVisible(true);
  };

  const handleClose = (isSave: boolean) => {
    updater.modalVisible(false);
    updater.curDetail(null);
    isSave && getList({ pageNo });
  };

  const [operationAuth, handleFiledAuth] = usePerm((s) => [
    s.project.iteration.operation.pass,
    s.project.iteration.handleFiled.pass,
  ]);

  const columns = [
    {
      title: i18n.t('dop:Name'),
      dataIndex: 'title',
      width: 200,
      render: (val: string) => (
        <Ellipsis className="fake-link nowrap" title={val}>
          {val}
        </Ellipsis>
      ),
    },
    {
      title: i18n.t('dop:Goal'),
      dataIndex: 'content',
      // width: 300,
    },
    {
      title: i18n.t('Period'),
      width: 230,
      dataIndex: 'startedAt',
      render: (startedAt: string, record: ITERATION.Detail) =>
        `${moment(startedAt).format('YYYY/MM/DD')} - ${moment(record.finishedAt).format('YYYY/MM/DD')}`,
    },
    {
      title: i18n.t('dop:Progress'),
      width: 120,
      dataIndex: 'issueSummary',
      render: (_k, record: ITERATION.Detail) => {
        const doneTotal = sumBy(map(record.issueSummary || {}), 'done') || 0;
        const totalCount = (sumBy(map(record.issueSummary || {}), 'undone') || 0) + doneTotal;
        const percent = ((totalCount ? doneTotal / totalCount : 0) * 100).toFixed(1);
        return (
          <div className="mr-2">
            <Progress percent={+percent} />
          </div>
        );
      },
    },
  ];

  const actions = {
    render: (record: ITERATION.Detail) => {
      if (record.state === 'FILED') {
        return [
          {
            title: (
              <WithAuth pass={handleFiledAuth}>
                <span>{i18n.t('dop:Unarchive')}</span>
              </WithAuth>
            ),
            onClick: () => onFiled(record, 'UNFILED'),
          },
        ];
      }

      return [
        {
          title: (
            <WithAuth pass={operationAuth}>
              <span>{i18n.t('Edit')}</span>
            </WithAuth>
          ),
          onClick: () => onEdit(record),
        },
        {
          title: (
            <WithAuth pass={handleFiledAuth}>
              <span>{i18n.t('Archive')}</span>
            </WithAuth>
          ),
          onClick: () => onFiled(record, 'FILED'),
        },
        {
          title: (
            <WithAuth pass={operationAuth}>
              <span>{i18n.t('Delete')}</span>
            </WithAuth>
          ),
          onClick: () => {
            Modal.confirm({
              title: `${i18n.t('common:confirm to delete')}？`,
              content: `${i18n.t('common:confirm this action')}？`,
              onOk() {
                onDelete(record.id);
              },
            });
          },
        },
      ];
    },
  };

  const addAuth = usePerm((s) => s.project.iteration.operation.pass);

  return (
    <div className="iteration">
      <TopButtonGroup>
        <WithAuth pass={addAuth} tipProps={{ placement: 'bottom' }}>
          <Button type="primary" onClick={onCreate}>
            {i18n.t('Add')}
          </Button>
        </WithAuth>
      </TopButtonGroup>
      <RadioTabs
        options={options}
        value={status}
        onChange={(v: string) => {
          setStatus(v);
        }}
        className="mb-2"
      />
      <ErdaTable
        tableKey="issue-iteration"
        rowKey="id"
        dataSource={list}
        columns={columns}
        loading={isFetching}
        actions={actions}
        pagination={{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (no: number, size: number) => {
            getList({ pageNo: no, pageSize: size });
          },
        }}
        onRow={(record) => {
          return {
            onClick: () => {
              goTo(goTo.pages.iterationDetail, {
                projectId,
                iterationId: record.id,
                issueType: 'all',
              });
            },
          };
        }}
      />
      <IterationModal visible={state.modalVisible} data={state.curDetail as ITERATION.Detail} onClose={handleClose} />
    </div>
  );
};
